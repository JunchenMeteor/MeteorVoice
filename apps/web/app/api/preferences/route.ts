import { guardApiRequest, jsonApiResult, jsonServerError } from '@/lib/server/http'
import { getPreferences, setPreferences } from '@/lib/server/preferences'

export async function GET(request: Request) {
  try {
    const guard = guardApiRequest(request, { name: 'preferences_get', windowMs: 60_000, maxRequests: 120 })
    if (guard) return jsonApiResult(guard)
    return jsonApiResult(await getPreferences())
  } catch (error) {
    return jsonServerError(error, 'Failed to load preferences')
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = guardApiRequest(request, { name: 'preferences_patch', windowMs: 60_000, maxRequests: 30, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const body = await request.json() as {
      tts_provider?: string
      locale?: string
      default_scenario_key?: string
      tts_speed?: number
      tts_voice_id?: string | null
      selected_voice_profile_id?: string | null
      ui_theme?: string
    }
    return jsonApiResult(await setPreferences(body))
  } catch (error) {
    return jsonServerError(error, 'Failed to save preferences')
  }
}
