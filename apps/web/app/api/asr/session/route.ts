import { jsonApiResult, jsonServerError } from '@/lib/server/http'
import { guardApiRequest } from '@/lib/server/http'
import { createASRSessionFromRequest } from '@/lib/server/asr'
import type { ASRSessionBootstrapRequest } from '@meteorvoice/shared'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const guard = guardApiRequest(request, { name: 'asr_session', windowMs: 60_000, maxRequests: 30, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const body = await request.json() as ASRSessionBootstrapRequest
    return jsonApiResult(await createASRSessionFromRequest(body))
  } catch (error) {
    return jsonServerError(error, 'Failed to create ASR session')
  }
}
