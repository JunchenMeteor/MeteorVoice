import { jsonApiResult, jsonServerError } from '@/lib/server/http'
import { getPreferences, setPreferences } from '@/lib/server/preferences'

export async function GET() {
  try {
    return jsonApiResult(await getPreferences())
  } catch (error) {
    return jsonServerError(error, 'Failed to load preferences')
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as {
      tts_provider?: string
      locale?: string
      default_scenario_key?: string
      default_accent_key?: string
      tts_speed?: number
      tts_voice_id?: string | null
      ui_theme?: string
    }
    return jsonApiResult(await setPreferences(body))
  } catch (error) {
    return jsonServerError(error, 'Failed to save preferences')
  }
}
