/**
 * Session CRUD operations. / 会话增删改查。
 */
import type { Tables } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'

type SessionHistoryRow = Pick<Tables<'learning_history'>, 'session_id' | 'summary'>
type SessionListRow = Pick<Tables<'sessions'>, 'id' | 'started_at' | 'status'> & {
  accent_profiles: Pick<Tables<'accent_profiles'>, 'key' | 'name'> | null
  scenarios: Pick<Tables<'scenarios'>, 'key' | 'name'> | null
}
type CorrectionItemRow = Pick<
  Tables<'correction_items'>,
  'id' | 'correction_type' | 'original_text' | 'suggested_text' | 'explanation' | 'audio_url' | 'severity' | 'created_at'
>
type SessionTurnRow = Pick<
  Tables<'turns'>,
  'id' | 'session_id' | 'speaker' | 'transcript' | 'translated_text' | 'audio_url' | 'created_at'
> & {
  correction_items: CorrectionItemRow[] | null
}

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

  const { data: sessions, error, count } = options?.scenarioKey
    ? await supabase
      .from('sessions')
      .select('id, started_at, ended_at, status, scenarios!inner(key, name), accent_profiles(key, name)', { count: 'exact' })
      .eq('user_id', user.id)
      .neq('status', 'deleted')
      .eq('scenarios.key', options.scenarioKey)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit)
    : await supabase
      .from('sessions')
      .select('id, started_at, ended_at, status, scenarios(key, name), accent_profiles(key, name)', { count: 'exact' })
      .eq('user_id', user.id)
      .neq('status', 'deleted')
      .order('started_at', { ascending: false })
      .range(offset, offset + limit)

  if (error) return { error: error.message, status: 500 as const }

  const { data: histories } = await supabase
    .from('learning_history')
    .select('session_id, summary')
    .eq('user_id', user.id)

  const summaryMap = new Map(
    ((histories ?? []) as SessionHistoryRow[]).map(history => [history.session_id, history.summary]),
  )

  const totalCount = count ?? (sessions ?? []).length
  const hasMore = offset + (sessions ?? []).length < totalCount

  const result = ((sessions ?? []) as SessionListRow[]).map(session => ({
    id: session.id,
    scenario: session.scenarios?.name ?? 'Unknown',
    scenario_key: session.scenarios?.key ?? null,
    accent: session.accent_profiles?.name ?? 'Auto',
    accent_key: session.accent_profiles?.key ?? null,
    date: new Date(session.started_at).toISOString().split('T')[0],
    status: session.status,
    summary: summaryMap.get(session.id) ?? null,
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
    turns: ((turns ?? []) as SessionTurnRow[]).map(turn => ({
      id: turn.id,
      sessionId: turn.session_id,
      speaker: turn.speaker,
      transcript: turn.transcript,
      translatedText: turn.translated_text,
      audioUrl: turn.audio_url,
      createdAt: turn.created_at,
      corrections: (turn.correction_items ?? []).map(correction => ({
        id: correction.id,
        type: correction.correction_type,
        originalText: correction.original_text,
        suggestedText: correction.suggested_text ?? '',
        explanation: correction.explanation ?? '',
        severity: correction.severity,
        audioUrl: correction.audio_url,
        createdAt: correction.created_at,
      })),
    })),
  }
}
