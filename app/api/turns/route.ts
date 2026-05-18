import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as {
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
    }

    const { data: turn, error } = await supabase
      .from('turns')
      .insert({
        session_id: body.session_id,
        speaker: body.speaker,
        transcript: body.transcript,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Save corrections if any
    if (body.corrections && body.corrections.length > 0 && turn) {
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

    return NextResponse.json({ success: true, turn_id: turn?.id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
