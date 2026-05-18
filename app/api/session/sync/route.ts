import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as {
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
    }

    // Find or match scenario/accent by name
    const { data: scenarioData } = await supabase
      .from('scenarios')
      .select('id')
      .eq('name', body.scenario)
      .single()

    const { data: accentData } = await supabase
      .from('accent_profiles')
      .select('id')
      .eq('name', body.accent)
      .single()

    // Create session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .upsert({
        id: body.session_id,
        user_id: user.id,
        scenario_id: scenarioData?.id ?? null,
        accent_profile_id: accentData?.id ?? null,
        status: 'completed',
        started_at: new Date(Date.now() - body.turns * 8000).toISOString(),
        ended_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select()
      .single()

    if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 })

    // Save the last assistant turn + corrections
    const assistantMsgs = body.messages.filter(m => m.role === 'assistant')
    if (assistantMsgs.length > 0) {
      const lastContent = assistantMsgs[assistantMsgs.length - 1].content
      const { data: turn, error: turnError } = await supabase
        .from('turns')
        .insert({
          session_id: session.id,
          speaker: 'assistant',
          transcript: lastContent.slice(0, 2000),
        })
        .select()
        .single()

      if (!turnError && turn && body.corrections.length > 0) {
        const correctionRows = body.corrections.map(c => ({
          turn_id: turn.id,
          correction_type: c.type,
          original_text: c.originalText,
          suggested_text: c.suggestedText,
          explanation: c.explanation,
          severity: c.severity,
        }))
        await supabase.from('correction_items').insert(correctionRows)
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
