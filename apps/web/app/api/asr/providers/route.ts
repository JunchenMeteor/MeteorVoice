/**
 * ASR provider listing. / 语音识别提供商列表。
 */
import {
  getASRProviders,
  getDefaultASRProvider,
} from '@/lib/server/asr'
import {
  guardApiRequest,
  jsonApiResult,
  jsonServerError,
} from '@/lib/server/http'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const guard = guardApiRequest(request, { name: 'asr-providers', windowMs: 60_000, maxRequests: 120, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    return jsonApiResult({
      providers: getASRProviders(),
      default_provider: getDefaultASRProvider(),
    })
  } catch (error) {
    return jsonServerError(error, 'Failed to load ASR providers')
  }
}
