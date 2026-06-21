/**
 * Text-to-speech synthesis. / 文本转语音合成。
 */
import { synthesizeSpeechFromRequest } from '@/lib/server/tts'
import {
  getApiUser,
  guardApiRequest,
  isApiErrorResult,
  jsonApiResult,
  jsonServerError,
} from '@/lib/server/http'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const guard = await guardApiRequest(request, { name: 'tts', windowMs: 60_000, maxRequests: 60, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const auth = await getApiUser()
    if (isApiErrorResult(auth)) return jsonApiResult(auth)
    const body = await request.json() as {
      text?: string
      accent?: string
      speed?: number
      provider?: string
      voiceId?: string
    }

    const result = await synthesizeSpeechFromRequest({
      ...body,
      userId: auth.user.id,
      audioBaseUrl: getRequestBaseUrl(request),
    })
    return jsonApiResult(result)
  } catch (error) {
    return jsonServerError(error, 'TTS failed')
  }
}

function getRequestBaseUrl(request: Request) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const protocol = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '')
  return host ? `${protocol}://${host}` : new URL(request.url).origin
}
