import { jsonApiResult } from '@/lib/server/http'
import { FALLBACK_SESSION_SUMMARY, generateSessionSummary } from '@/lib/server/summary'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      sessionId: string
      scenario: string
      messages: { role: string; content: string }[]
      turnNumber: number
    }
    const summary = await generateSessionSummary(body)
    return jsonApiResult({ summary })
  } catch (e) {
    return jsonApiResult({ summary: FALLBACK_SESSION_SUMMARY })
  }
}
