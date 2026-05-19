import { jsonApiResult, jsonServerError } from '@/lib/server/http'
import { createTurn } from '@/lib/server/turns'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      session_id: string
      speaker: string
      transcript: string
      corrections?: {
        type: string
        originalText: string
        suggestedText: string
        explanation: string
        severity: string
      }[]
    }
    const result = await createTurn(body)
    return jsonApiResult(result)
  } catch (e) {
    return jsonServerError(e)
  }
}
