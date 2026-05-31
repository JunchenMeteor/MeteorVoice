import { jsonApiResult, jsonServerError } from '@/lib/server/http'
import { createASRSessionFromRequest } from '@/lib/server/asr'
import type { ASRSessionBootstrapRequest } from '@meteorvoice/shared'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json() as ASRSessionBootstrapRequest
    return jsonApiResult(createASRSessionFromRequest(body))
  } catch (error) {
    return jsonServerError(error, 'Failed to create ASR session')
  }
}
