/**
 * Session resource operations. / 会话资源操作。
 */
import { deleteSession } from '@/lib/server/session'
import {
  guardApiRequest,
  jsonApiResult,
  jsonServerError,
  requireApiUser,
} from '@/lib/server/http'

async function guardSessionResourceRequest(request: Request) {
  const guard = await guardApiRequest(request, { name: 'session-resource', windowMs: 60_000, maxRequests: 60, requireClientHeader: true })
  if (guard) return guard
  return requireApiUser()
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const auth = await guardSessionResourceRequest(request)
    if (auth) return jsonApiResult(auth)
    const { sessionId } = await context.params
    return jsonApiResult(await deleteSession(sessionId))
  } catch (error) {
    return jsonServerError(error, 'Failed to delete session')
  }
}
