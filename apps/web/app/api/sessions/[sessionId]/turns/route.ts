import { jsonApiResult, jsonServerError } from '@/lib/server/http'
import { listSessionTurns } from '@/lib/server/session'

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params
    return jsonApiResult(await listSessionTurns(sessionId))
  } catch (error) {
    return jsonServerError(error, 'Failed to load session turns')
  }
}
