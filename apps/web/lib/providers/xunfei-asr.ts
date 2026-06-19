import crypto from 'crypto'
import type { ASRSessionBootstrapResponse, ASRSessionConfig } from '@meteorvoice/shared'
import { requireEnv } from '@/lib/server/env'

const zhIatHost = 'iat.xf-yun.com'
const zhIatPath = '/v1'
// Cache for burst protection during prewarm (WebSocket opens ~1s before actual
// capture start). 2 minutes is shorter than the 4-minute original — still long
// enough for prewarm reuse, but reduces the window where Xunfei may link multiple
// restarts to the same credentials. If Xunfei returns an auth expiry error, the
// client will retry with backoff and eventually get a fresh URL after cache expiry.
const signedUrlTtlMs = 2 * 60 * 1000
const signedUrlRefreshSkewMs = 20 * 1000

type CachedSignedUrl = {
  endpointUrl: string
  expiresAtMs: number
}

let cachedSignedUrl: CachedSignedUrl | null = null

function createAuthUrl(apiKey: string, apiSecret: string) {
  const date = new Date().toUTCString()
  const signatureOrigin = `host: ${zhIatHost}\ndate: ${date}\nGET ${zhIatPath} HTTP/1.1`
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(signatureOrigin)
    .digest('base64')
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  const authorization = Buffer.from(authorizationOrigin).toString('base64')

  return `wss://${zhIatHost}${zhIatPath}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${zhIatHost}`
}

function getCachedAuthUrl(apiKey: string, apiSecret: string, now: number) {
  if (cachedSignedUrl && cachedSignedUrl.expiresAtMs - signedUrlRefreshSkewMs > now) {
    console.log('[xunfei-asr] url_cache_hit', {
      cacheAgeMs: now - (cachedSignedUrl.expiresAtMs - signedUrlTtlMs),
      ttlRemainingMs: cachedSignedUrl.expiresAtMs - now,
    })
    return cachedSignedUrl
  }

  console.log('[xunfei-asr] url_cache_miss', {
    hadCachedUrl: cachedSignedUrl !== null,
    urlDate: new Date().toISOString(),
  })
  cachedSignedUrl = {
    endpointUrl: createAuthUrl(apiKey, apiSecret),
    expiresAtMs: now + signedUrlTtlMs,
  }
  return cachedSignedUrl
}

export async function createXunfeiASRSession(config: ASRSessionConfig): Promise<ASRSessionBootstrapResponse> {
  const appId = requireEnv('XUNFEI_ASR_APP_ID', 'Xunfei ASR')
  const apiKey = requireEnv('XUNFEI_ASR_API_KEY', 'Xunfei ASR')
  const apiSecret = requireEnv('XUNFEI_ASR_API_SECRET', 'Xunfei ASR')
  const product = process.env.XUNFEI_ASR_PRODUCT?.trim() || 'zh_iat'

  if (product !== 'zh_iat') {
    throw new Error(`Unsupported Xunfei ASR product: ${product}`)
  }

  const now = Date.now()
  const signedUrl = getCachedAuthUrl(apiKey, apiSecret, now)
  const sessionId = config.sessionId ?? `asr_xunfei_${crypto.randomUUID()}`
  const eosMs = Math.min(6000, Math.max(600, config.endpointSilenceMs ?? 900))

  return {
    provider: 'xunfei',
    status: 'created',
    sessionId,
    transport: 'websocket',
    endpointUrl: signedUrl.endpointUrl,
    expiresAt: new Date(signedUrl.expiresAtMs).toISOString(),
    providerConfig: {
      appId,
      domain: 'iat',
      language: 'zh_cn',
      accent: 'mandarin',
      eosMs,
      audioEncoding: 'raw',
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16,
      frameIntervalMs: 40,
      frameSizeBytes: 1280,
    },
    config: {
      ...config,
      sessionId,
      provider: 'xunfei',
      mode: config.mode === 'streaming' ? 'streaming' : 'single_utterance',
      languageMode: config.languageMode === 'english' ? 'english' : 'mixed_zh_en',
    },
  }
}
