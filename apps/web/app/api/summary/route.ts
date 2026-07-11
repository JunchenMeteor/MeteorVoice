/**
 * Session summary generation. / 会话总结生成。
 */
import {
  FALLBACK_SESSION_SUMMARY,
  generateSessionSummary,
} from '@/lib/server/summary'
import {
  parseSummaryRequest,
  readJsonRequest,
} from '@/lib/server/api-input'
import {
  guardApiRequest,
  jsonApiResult,
  requireApiUser,
} from '@/lib/server/http'

export async function POST(request: Request) {
  try {
    const guard = await guardApiRequest(request, { name: 'summary', windowMs: 60_000, maxRequests: 30, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const auth = await requireApiUser()
    if (auth) return jsonApiResult(auth)
    const json = await readJsonRequest(request, 256 * 1024)
    if ('error' in json) return jsonApiResult(json)
    const body = parseSummaryRequest(json.value)
    if ('error' in body) return jsonApiResult(body)
    const summary = await generateSessionSummary(body.value)
    return jsonApiResult({ summary })
  } catch {
    return jsonApiResult({ summary: FALLBACK_SESSION_SUMMARY })
  }
}
