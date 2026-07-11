/**
 * Conversation turn creation. / 对话轮次创建。
 */
import { createTurn } from '@/lib/server/turns'
import {
  parseTurnRequest,
  readJsonRequest,
} from '@/lib/server/api-input'
import {
  guardApiRequest,
  jsonApiResult,
  jsonServerError,
  requireApiUser,
} from '@/lib/server/http'

export async function POST(request: Request) {
  try {
    const guard = await guardApiRequest(request, { name: 'turns', windowMs: 60_000, maxRequests: 60, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const auth = await requireApiUser()
    if (auth) return jsonApiResult(auth)
    const json = await readJsonRequest(request, 64 * 1024)
    if ('error' in json) return jsonApiResult(json)
    const body = parseTurnRequest(json.value)
    if ('error' in body) return jsonApiResult(body)
    const result = await createTurn(body.value)
    return jsonApiResult(result)
  } catch (e) {
    return jsonServerError(e)
  }
}
