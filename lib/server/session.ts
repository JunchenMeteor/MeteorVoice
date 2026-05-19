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

export async function listSessions() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sessions: [] }

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, started_at, ended_at, status, scenarios(name), accent_profiles(name)')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(30)

  if (error) return { error: error.message, status: 500 as const }

  const { data: histories } = await supabase
    .from('learning_history')
    .select('session_id, summary')
    .eq('user_id', user.id)

  const summaryMap = new Map((histories ?? []).map((history: { session_id: string; summary: string }) => [history.session_id, history.summary]))

  const result = (sessions ?? []).map((session: Record<string, unknown>) => ({
    id: session.id,
    scenario: (session.scenarios as { name: string } | null)?.name ?? 'Unknown',
    accent: (session.accent_profiles as { name: string } | null)?.name ?? 'Auto',
    date: new Date(session.started_at as string).toISOString().split('T')[0],
    status: session.status,
    summary: summaryMap.get(session.id as string) ?? null,
  }))

  return { sessions: result }
}
