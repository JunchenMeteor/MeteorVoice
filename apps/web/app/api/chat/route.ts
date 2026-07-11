/**
 * AI coach chat endpoint. / AI 教练对话端点。
 */
import { AIProviderUnavailableError } from '@/lib/providers/ai-provider'
import {
  parseChatRequest,
  readJsonRequest,
} from '@/lib/server/api-input'
import { generateCoachReply } from '@/lib/server/chat'
import {
  guardApiRequest,
  jsonApiResult,
  jsonServerError,
  requireApiUser,
} from '@/lib/server/http'

export async function POST(request: Request) {
  try {
    const guard = await guardApiRequest(request, { name: 'chat', windowMs: 60_000, maxRequests: 30, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const auth = await requireApiUser()
    if (auth) return jsonApiResult(auth)
    const json = await readJsonRequest(request, 64 * 1024)
    if ('error' in json) return jsonApiResult(json)
    const body = parseChatRequest(json.value)
    if ('error' in body) return jsonApiResult(body)
    const response = await generateCoachReply(body.value.messages, body.value.context)
    return jsonApiResult(response)
  } catch (e) {
    if (e instanceof AIProviderUnavailableError) {
      return jsonApiResult({ error: 'AI coach is temporarily unavailable', status: 503 })
    }
    return jsonServerError(e)
  }
}
