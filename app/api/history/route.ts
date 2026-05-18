import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ sessions: [] })

    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id, started_at, ended_at, status, scenarios(name), accent_profiles(name)')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(30)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: histories } = await supabase
      .from('learning_history')
      .select('session_id, summary')
      .eq('user_id', user.id)

    const summaryMap = new Map((histories ?? []).map((h: { session_id: string; summary: string }) => [h.session_id, h.summary]))

    const result = (sessions ?? []).map((s: Record<string, unknown>) => ({
      id: s.id,
      scenario: (s.scenarios as { name: string } | null)?.name ?? 'Unknown',
      accent: (s.accent_profiles as { name: string } | null)?.name ?? 'Auto',
      date: new Date(s.started_at as string).toISOString().split('T')[0],
      status: s.status,
      summary: summaryMap.get(s.id as string) ?? null,
    }))

    return NextResponse.json({ sessions: result })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
