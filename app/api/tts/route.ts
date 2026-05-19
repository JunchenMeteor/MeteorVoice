import { NextResponse } from 'next/server'
import { createServerTTS } from '@/lib/providers/server-tts'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      text?: string
      accent?: string
      speed?: number
      provider?: string
    }

    if (!body.text?.trim()) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    const tts = createServerTTS(body.provider)
    const result = await tts.synthesize(body.text, {
      accent: body.accent,
      speed: body.speed,
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'TTS failed' },
      { status: 500 },
    )
  }
}
