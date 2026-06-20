/**
 * Session summary generation. / 会话总结生成。
 */
import { guardApiRequest, jsonApiResult, requireApiUser } from '@/lib/server/http'
import { FALLBACK_SESSION_SUMMARY, generateSessionSummary } from '@/lib/server/summary'

export async function POST(request: Request) {
  try {
    const guard = guardApiRequest(request, { name: 'summary', windowMs: 60_000, maxRequests: 30, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const auth = await requireApiUser()
    if (auth) return jsonApiResult(auth)
    const body = await request.json() as {
      sessionId: string
      scenario: string
      messages: { role: string; content: string }[]
      turnNumber: number
    }
    const summary = await generateSessionSummary(body)
    return jsonApiResult({ summary })
  } catch {
    return jsonApiResult({ summary: FALLBACK_SESSION_SUMMARY })
  }
}
