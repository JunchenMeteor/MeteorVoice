/**
 * Session turn history. / 会话对话轮次历史。
 */
import { listSessionTurns } from '@/lib/server/session'
import {
  guardApiRequest,
  jsonApiResult,
  jsonServerError,
  requireApiUser,
} from '@/lib/server/http'

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const guard = guardApiRequest(request, { name: 'session-turns', windowMs: 60_000, maxRequests: 60, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const auth = await requireApiUser()
    if (auth) return jsonApiResult(auth)
    const { sessionId } = await context.params
    return jsonApiResult(await listSessionTurns(sessionId))
  } catch (error) {
    return jsonServerError(error, 'Failed to load session turns')
  }
}
