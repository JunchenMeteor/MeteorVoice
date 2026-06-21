/**
 * Session create, delete, and status update. / 会话创建、删除和状态更新。
 */
import {
  createSession,
  deleteSession,
  updateSessionStatus,
} from '@/lib/server/session'
import {
  guardApiRequest,
  jsonApiResult,
  jsonServerError,
  requireApiUser,
} from '@/lib/server/http'

async function guardSessionRequest(request: Request) {
  const guard = await guardApiRequest(request, { name: 'session', windowMs: 60_000, maxRequests: 60, requireClientHeader: true })
  if (guard) return guard
  return requireApiUser()
}

export async function POST(request: Request) {
  try {
    const auth = await guardSessionRequest(request)
    if (auth) return jsonApiResult(auth)
    const body = await request.json() as {
      scenario_id?: string
      accent_profile_id?: string
    }
    const result = await createSession(body)
    if ('session' in result) return jsonApiResult(result.session)
    return jsonApiResult(result)
  } catch (e) {
    return jsonServerError(e)
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await guardSessionRequest(request)
    if (auth) return jsonApiResult(auth)
    const body = await request.json() as { id: string; status: string }
    const result = await updateSessionStatus(body)
    return jsonApiResult(result)
  } catch (e) {
    return jsonServerError(e)
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await guardSessionRequest(request)
    if (auth) return jsonApiResult(auth)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return jsonApiResult({ error: 'Missing session id' })
    const result = await deleteSession(id)
    return jsonApiResult(result)
  } catch (e) {
    return jsonServerError(e)
  }
}
