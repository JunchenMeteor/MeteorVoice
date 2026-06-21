/**
 * ASR session creation and renewal. / 语音识别会话创建和续期。
 */
import type { ASRSessionBootstrapRequest } from '@meteorvoice/shared'

import { createASRSessionFromRequest } from '@/lib/server/asr'
import {
  guardApiRequest,
  jsonApiResult,
  jsonServerError,
  requireApiUser,
} from '@/lib/server/http'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const guard = await guardApiRequest(request, { name: 'asr_session', windowMs: 60_000, maxRequests: 30, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const auth = await requireApiUser()
    if (auth) return jsonApiResult(auth)
    const body = await request.json() as ASRSessionBootstrapRequest
    return jsonApiResult(await createASRSessionFromRequest(body))
  } catch (error) {
    return jsonServerError(error, 'Failed to create ASR session')
  }
}
