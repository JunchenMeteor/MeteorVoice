/**
 * Session finalization and data sync. / 会话结束和数据同步。
 */
import { finalizeSession } from '@/lib/server/turns'
import {
  parseSessionSyncRequest,
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
    const guard = await guardApiRequest(request, { name: 'session-sync', windowMs: 60_000, maxRequests: 30, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const auth = await requireApiUser()
    if (auth) return jsonApiResult(auth)
    const json = await readJsonRequest(request, 512 * 1024)
    if ('error' in json) return jsonApiResult(json)
    const body = parseSessionSyncRequest(json.value)
    if ('error' in body) return jsonApiResult(body)
    const result = await finalizeSession(body.value)
    return jsonApiResult(result)
  } catch (e) {
    return jsonServerError(e)
  }
}
