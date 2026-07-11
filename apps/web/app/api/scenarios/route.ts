/**
 * Practice scenario listing. / 练习场景列表。
 */
import {
  getScenarioDescription,
  getScenarioLabel,
  normalizeLocale,
} from '@meteorvoice/shared'

import {
  guardApiRequest,
  jsonApiResult,
  jsonServerError,
} from '@/lib/server/http'
import { listConfiguredScenarios } from '@/lib/server/scenarios'

export async function GET(request: Request) {
  try {
    const guard = await guardApiRequest(request, { name: 'scenarios', windowMs: 60_000, maxRequests: 120, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const url = new URL(request.url)
    const locale = normalizeLocale(url.searchParams.get('locale'))
    const configuredScenarios = await listConfiguredScenarios()

    return jsonApiResult({
      scenarios: configuredScenarios.map(scenario => ({
        ...scenario,
        label: getScenarioLabel(scenario, locale),
        localized_description: getScenarioDescription(scenario, locale),
      })),
    })
  } catch (error) {
    return jsonServerError(error, 'Failed to load scenarios')
  }
}
