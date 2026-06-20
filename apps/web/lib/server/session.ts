/**
 * Session CRUD operations. / 会话增删改查。
 */
import { createClient } from '@/lib/supabase/server'

export async function createSession(input: { scenario_id?: string; accent_profile_id?: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      scenario_id: input.scenario_id || null,
      accent_profile_id: input.accent_profile_id || null,
      status: 'active',
    })
    .select()
    .single()

  if (error) return { error: error.message, status: 500 as const }
  return { session }
}

export async function updateSessionStatus(input: { id: string; status: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const { error } = await supabase
    .from('sessions')
    .update({ status: input.status, ended_at: new Date().toISOString() })
    .eq('id', input.id)
    .eq('user_id', user.id)

  if (error) return { error: error.message, status: 500 as const }
  return { success: true }
}

export async function listSessions(options?: {
  offset?: number
  limit?: number
  scenarioKey?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sessions: [], hasMore: false }

  const limit = Math.min(options?.limit ?? 20, 50)
  const offset = options?.offset ?? 0

  let query = supabase
    .from('sessions')
    .select('id, started_at, ended_at, status, scenarios(key, name), accent_profiles(key, name)', { count: 'exact' })
    .eq('user_id', user.id)
    .neq('status', 'deleted')
    .order('started_at', { ascending: false })
    .range(offset, offset + limit)

  if (options?.scenarioKey) {
    query = supabase
      .from('sessions')
      .select('id, started_at, ended_at, status, scenarios!inner(key, name), accent_profiles(key, name)', { count: 'exact' })
      .eq('user_id', user.id)
      .neq('status', 'deleted')
      .eq('scenarios.key', options.scenarioKey)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit)
  }

  const { data: sessions, error, count } = await query

  if (error) return { error: error.message, status: 500 as const }

  const { data: histories } = await supabase
    .from('learning_history')
    .select('session_id, summary')
    .eq('user_id', user.id)

  const summaryMap = new Map(
    (histories ?? []).map((h: { session_id: string; summary: string }) => [h.session_id, h.summary]),
  )

  const totalCount = count ?? (sessions ?? []).length
  const hasMore = offset + (sessions ?? []).length < totalCount

  const result = (sessions ?? []).map((session: Record<string, unknown>) => ({
    id: String(session.id),
    scenario: (session.scenarios as { name: string } | null)?.name ?? 'Unknown',
    scenario_key: (session.scenarios as { key?: string } | null)?.key ?? null,
    accent: (session.accent_profiles as { name: string } | null)?.name ?? 'Auto',
    accent_key: (session.accent_profiles as { key?: string } | null)?.key ?? null,
    date: new Date(session.started_at as string).toISOString().split('T')[0],
    status: String(session.status),
    summary: summaryMap.get(session.id as string) ?? null,
  }))

  return { sessions: result, hasMore }
}

export async function deleteSession(sessionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  // 软删除：status → 'deleted'
  const { error } = await supabase
    .from('sessions')
    .update({ status: 'deleted', ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', user.id)

  if (error) return { error: error.message, status: 500 as const }
  return { success: true }
}

export async function listSessionTurns(sessionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (sessionError) return { error: sessionError.message, status: 500 as const }
  if (!session) return { error: 'Session not found', status: 404 as const }

  const { data: turns, error } = await supabase
    .from('turns')
    .select(`
      id,
      session_id,
      speaker,
      transcript,
      translated_text,
      audio_url,
      created_at,
      correction_items (
        id,
        correction_type,
        original_text,
        suggested_text,
        explanation,
        audio_url,
        severity,
        created_at
      )
    `)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) return { error: error.message, status: 500 as const }

  return {
    session_id: sessionId,
    turns: (turns ?? []).map((turn: Record<string, unknown>) => ({
      id: String(turn.id),
      sessionId: String(turn.session_id),
      speaker: String(turn.speaker),
      transcript: String(turn.transcript ?? ''),
      translatedText: typeof turn.translated_text === 'string' ? turn.translated_text : null,
      audioUrl: typeof turn.audio_url === 'string' ? turn.audio_url : null,
      createdAt: String(turn.created_at),
      corrections: ((turn.correction_items as Record<string, unknown>[] | null) ?? []).map(correction => ({
        id: String(correction.id),
        type: String(correction.correction_type),
        originalText: String(correction.original_text ?? ''),
        suggestedText: String(correction.suggested_text ?? ''),
        explanation: String(correction.explanation ?? ''),
        severity: String(correction.severity ?? 'minor'),
        audioUrl: typeof correction.audio_url === 'string' ? correction.audio_url : null,
        createdAt: String(correction.created_at),
      })),
    })),
  }
}
