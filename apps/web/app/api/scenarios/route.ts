import { jsonApiResult, jsonServerError } from '@/lib/server/http'
import {
  getScenarioDescription,
  getScenarioLabel,
  scenarios,
  type Locale,
} from '@meteorvoice/shared'

export async function GET(request: Request) {
  try {
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

function normalizeLocale(value: string | null): Locale {
  return value === 'zh' ? 'zh' : 'en'
}
