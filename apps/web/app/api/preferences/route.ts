/**
 * User preferences read and update. / 用户偏好读写。
 */
import {
  getPreferences,
  setPreferences,
} from '@/lib/server/preferences'
import {
  guardApiRequest,
  jsonApiResult,
  jsonServerError,
  requireApiUser,
} from '@/lib/server/http'

export async function GET(request: Request) {
  try {
    const guard = await guardApiRequest(request, { name: 'preferences_get', windowMs: 60_000, maxRequests: 30, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const auth = await requireApiUser()
    if (auth) return jsonApiResult(auth)
    return jsonApiResult(await getPreferences())
  } catch (error) {
    return jsonServerError(error, 'Failed to load preferences')
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await guardApiRequest(request, { name: 'preferences_patch', windowMs: 60_000, maxRequests: 30, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const auth = await requireApiUser()
    if (auth) return jsonApiResult(auth)
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
