import { jsonApiResult, jsonServerError } from '@/lib/server/http'
import { listSessions } from '@/lib/server/session'

export async function GET() {
  try {
    const result = await listSessions()
    return jsonApiResult(result)
  } catch (e) {
    return jsonServerError(e)
  }
}
