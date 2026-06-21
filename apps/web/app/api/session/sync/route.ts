/**
 * Session finalization and data sync. / 会话结束和数据同步。
 */
import { finalizeSession } from '@/lib/server/turns'
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
    const body = await request.json() as {
      session_id: string
      scenario: string
      accent: string
      turns: number
      messages: { role: string; content: string }[]
      corrections: {
        type: string
        originalText: string
        suggestedText: string
        explanation: string
        severity: string
      }[]
    }
    const result = await finalizeSession(body)
    return jsonApiResult(result)
  } catch (e) {
    return jsonServerError(e)
  }
}
