import { guardApiRequest, jsonApiResult, jsonServerError, requireApiUser } from '@/lib/server/http'
import { listSessions } from '@/lib/server/session'

export async function GET(request: Request) {
  try {
    const guard = guardApiRequest(request, { name: 'history', windowMs: 60_000, maxRequests: 60, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const auth = await requireApiUser()
    if (auth) return jsonApiResult(auth)
    const { searchParams } = new URL(request.url)
    const offset = parseInt(searchParams.get('offset') ?? '0', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50)
    const scenarioKey = searchParams.get('scenario') ?? undefined
    const result = await listSessions({ offset, limit, scenarioKey })
    return jsonApiResult(result)
  } catch (e) {
    return jsonServerError(e)
  }
}
