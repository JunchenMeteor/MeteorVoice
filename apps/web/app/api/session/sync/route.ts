import { jsonApiResult, jsonServerError } from '@/lib/server/http'
import { finalizeSession } from '@/lib/server/turns'

export async function POST(request: Request) {
  try {
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
