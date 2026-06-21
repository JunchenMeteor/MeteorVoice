/**
 * Accent profile and voice listing. / 口音配置和音色列表。
 */
import {
  accentProfiles,
  getAccentDescription,
  getAccentLabel,
  getAccentRegion,
  normalizeLocale,
  supportsAccent,
  ttsProviderCapabilities,
} from '@meteorvoice/shared'

import {
  getAvailableProviders,
  getTTSProviderPreference,
} from '@/lib/server/preferences'
import {
  guardApiRequest,
  jsonApiResult,
  jsonServerError,
} from '@/lib/server/http'

export async function GET(request: Request) {
  try {
    const guard = guardApiRequest(request, { name: 'accents', windowMs: 60_000, maxRequests: 120, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const url = new URL(request.url)
    const locale = normalizeLocale(url.searchParams.get('locale'))
    const selectedProvider = url.searchParams.get('provider') ?? await getTTSProviderPreference()
    const availableProviders = getAvailableProviders()

    return jsonApiResult({
      provider: selectedProvider,
      available_providers: availableProviders,
      accents: accentProfiles.map(accent => {
        const supportedProviders = Object.entries(ttsProviderCapabilities)
          .filter(([, capability]) => (capability.accents as readonly string[]).includes(accent.key))
          .map(([provider]) => provider)
        const supported = supportsAccent(selectedProvider, accent.key)

        return {
          ...accent,
          label: getAccentLabel(accent, locale),
          localized_region: getAccentRegion(accent, locale),
          localized_description: getAccentDescription(accent, locale),
          supported_providers: supportedProviders,
          supported,
          disabled_reason: supported ? null : `${selectedProvider} does not support ${accent.name}.`,
        }
      }),
    })
  } catch (error) {
    return jsonServerError(error, 'Failed to load accents')
  }
}

