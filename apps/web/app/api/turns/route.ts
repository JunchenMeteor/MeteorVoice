import { guardApiRequest, jsonApiResult, jsonServerError, requireApiUser } from '@/lib/server/http'
import { createTurn } from '@/lib/server/turns'

export async function POST(request: Request) {
  try {
    const guard = guardApiRequest(request, { name: 'turns', windowMs: 60_000, maxRequests: 60, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const auth = await requireApiUser()
    if (auth) return jsonApiResult(auth)
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
