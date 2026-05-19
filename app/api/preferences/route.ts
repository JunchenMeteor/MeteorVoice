import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Preferences = {
  tts_provider?: string
}

function normalizeTtsProvider(value?: string) {
  if (value === 'xunfei' || value === 'volcengine' || value === 'tencent') return value
  return 'mock'
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ tts_provider: 'mock' })

    const { data, error } = await supabase
      .from('theme_preferences')
      .select('tts_provider')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ tts_provider: data?.tts_provider ?? 'mock' })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load preferences' },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as Preferences
    const ttsProvider = normalizeTtsProvider(body.tts_provider)

    const { error } = await supabase
      .from('theme_preferences')
      .upsert({
        user_id: user.id,
        tts_provider: ttsProvider,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ tts_provider: ttsProvider })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save preferences' },
      { status: 500 },
    )
  }
}
