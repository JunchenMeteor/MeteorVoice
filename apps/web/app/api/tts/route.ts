import { jsonApiResult, jsonServerError } from '@/lib/server/http'
import { synthesizeSpeechFromRequest } from '@/lib/server/tts'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      text?: string
      accent?: string
      speed?: number
      provider?: string
    }

    const result = await synthesizeSpeechFromRequest(body)
    return jsonApiResult(result)
  } catch (error) {
    return jsonServerError(error, 'TTS failed')
  }
}
