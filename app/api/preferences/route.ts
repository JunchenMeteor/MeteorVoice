import { jsonApiResult, jsonServerError } from '@/lib/server/http'
import { getTTSProviderPreference, setTTSProviderPreference, getAvailableProviders } from '@/lib/server/preferences'

export async function GET() {
  try {
    const ttsProvider = await getTTSProviderPreference()
    const availableProviders = getAvailableProviders()
    return jsonApiResult({ tts_provider: ttsProvider, available_providers: availableProviders })
  } catch (error) {
    return jsonServerError(error, 'Failed to load preferences')
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { tts_provider?: string }
    const ttsProvider = await setTTSProviderPreference(body.tts_provider ?? 'mock')
    return jsonApiResult({ tts_provider: ttsProvider })
  } catch (error) {
    return jsonServerError(error, 'Failed to save preferences')
  }
}
