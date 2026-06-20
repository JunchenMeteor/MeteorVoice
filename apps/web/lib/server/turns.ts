/**
 * Turn history operations. / 对话轮次操作。
 */
import { createClient } from '@/lib/supabase/server'

export async function createTurn(input: {
  session_id: string
  speaker: string
  transcript: string
  corrections?: {
    type: string
    originalText: string
    suggestedText: string
    explanation: string
    severity: string
  }[]
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const { data: turn, error } = await supabase
    .from('turns')
    .insert({
      session_id: input.session_id,
      speaker: input.speaker,
      transcript: input.transcript,
    })
    .select()
    .single()

  if (error) return { error: error.message, status: 500 as const }

  if (input.corrections && input.corrections.length > 0 && turn) {
    const correctionRows = input.corrections.map(correction => ({
      turn_id: turn.id,
      correction_type: correction.type,
      original_text: correction.originalText,
      suggested_text: correction.suggestedText,
      explanation: correction.explanation,
      severity: correction.severity,
    }))
    await supabase.from('correction_items').insert(correctionRows)
  }

  return { turn_id: turn?.id }
}

export async function finalizeSession(input: {
  session_id: string
  scenario: string
  accent: string
  turns: number
  messages: { role: string; content: string }[]
  corrections: {
    type: string
    originalText: string
    suggestedText: string
    explanation: string
    severity: string
  }[]
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const { data: scenarioData } = await supabase
    .from('scenarios')
    .select('id')
    .eq('name', input.scenario)
    .single()

  const { data: accentData } = await supabase
    .from('accent_profiles')
    .select('id')
    .eq('name', input.accent)
    .single()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .upsert({
      id: input.session_id,
      user_id: user.id,
      scenario_id: scenarioData?.id ?? null,
      accent_profile_id: accentData?.id ?? null,
      status: 'completed',
      started_at: new Date(Date.now() - input.turns * 8000).toISOString(),
      ended_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select()
    .single()

  if (sessionError) return { error: sessionError.message, status: 500 as const }

  const assistantMessages = input.messages.filter(message => message.role === 'assistant')
  if (assistantMessages.length > 0) {
    const lastContent = assistantMessages[assistantMessages.length - 1].content
    const { data: turn, error: turnError } = await supabase
      .from('turns')
      .insert({
        session_id: session.id,
        speaker: 'assistant',
        transcript: lastContent.slice(0, 2000),
      })
      .select()
      .single()

    if (!turnError && turn && input.corrections.length > 0) {
      const correctionRows = input.corrections.map(correction => ({
        turn_id: turn.id,
        correction_type: correction.type,
        original_text: correction.originalText,
        suggested_text: correction.suggestedText,
        explanation: correction.explanation,
        severity: correction.severity,
      }))
      await supabase.from('correction_items').insert(correctionRows)
    }
  }

  return { success: true }
}

export async function saveSessionSummary(input: { userSummary: string; sessionId?: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: true }

  const payload: Record<string, string> = {
    user_id: user.id,
    summary: input.userSummary,
  }
  if (input.sessionId) {
    payload.session_id = input.sessionId
  }

  await supabase.from('learning_history').insert(payload)
  return { success: true }
}
