import { jsonApiResult, jsonServerError } from '@/lib/server/http'
import { createSession, updateSessionStatus } from '@/lib/server/session'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      scenario_id?: string
      accent_profile_id?: string
    }
    const result = await createSession(body)
    if ('session' in result) return jsonApiResult(result.session)
    return jsonApiResult(result)
  } catch (e) {
    return jsonServerError(e)
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { id: string; status: string }
    const result = await updateSessionStatus(body)
    return jsonApiResult(result)
  } catch (e) {
    return jsonServerError(e)
  }
}
