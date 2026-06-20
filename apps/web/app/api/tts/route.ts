/**
 * Text-to-speech synthesis. / 文本转语音合成。
 */
import { guardApiRequest, jsonApiResult, jsonServerError, requireApiUser } from '@/lib/server/http'
import { synthesizeSpeechFromRequest } from '@/lib/server/tts'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const guard = guardApiRequest(request, { name: 'tts', windowMs: 60_000, maxRequests: 60, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const auth = await requireApiUser()
    if (auth) return jsonApiResult(auth)
    const body = await request.json() as {
      text?: string
      accent?: string
      speed?: number
      provider?: string
      voiceId?: string
    }

    const result = await synthesizeSpeechFromRequest(body)
    return jsonApiResult(result)
  } catch (error) {
    return jsonServerError(error, 'TTS failed')
  }
}
