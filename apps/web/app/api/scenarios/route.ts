/**
 * Practice scenario listing. / 练习场景列表。
 */
import {
  getScenarioDescription,
  getScenarioLabel,
  normalizeLocale,
  scenarios,
} from '@meteorvoice/shared'

import {
  guardApiRequest,
  jsonApiResult,
  jsonServerError,
} from '@/lib/server/http'

export async function GET(request: Request) {
  try {
    const guard = guardApiRequest(request, { name: 'scenarios', windowMs: 60_000, maxRequests: 120, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const url = new URL(request.url)
    const locale = normalizeLocale(url.searchParams.get('locale'))

    return jsonApiResult({
      scenarios: scenarios.map(scenario => ({
        ...scenario,
        label: getScenarioLabel(scenario, locale),
        localized_description: getScenarioDescription(scenario, locale),
      })),
    })
  } catch (error) {
    return jsonServerError(error, 'Failed to load scenarios')
  }
}

