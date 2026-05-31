import { jsonApiResult, jsonServerError } from '@/lib/server/http'
import { listSessions } from '@/lib/server/session'

export async function GET(request: Request) {
  try {
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
