import { jsonApiResult, jsonServerError } from '@/lib/server/http'
import { getASRProviders, getDefaultASRProvider } from '@/lib/server/asr'

export const runtime = 'nodejs'

export async function GET() {
  try {
    return jsonApiResult({
      providers: getASRProviders(),
      default_provider: getDefaultASRProvider(),
    })
  } catch (error) {
    return jsonServerError(error, 'Failed to load ASR providers')
  }
}
