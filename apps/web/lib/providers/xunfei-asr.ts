import crypto from 'crypto'
import type { ASRSessionBootstrapResponse, ASRSessionConfig } from '@meteorvoice/shared'

const zhIatHost = 'iat.xf-yun.com'
const zhIatPath = '/v1'

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for Xunfei ASR`)
  return value
}

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

export async function createXunfeiASRSession(config: ASRSessionConfig): Promise<ASRSessionBootstrapResponse> {
  const appId = requireEnv('XUNFEI_ASR_APP_ID')
  const apiKey = requireEnv('XUNFEI_ASR_API_KEY')
  const apiSecret = requireEnv('XUNFEI_ASR_API_SECRET')
  const product = process.env.XUNFEI_ASR_PRODUCT?.trim() || 'zh_iat'

  if (product !== 'zh_iat') {
    throw new Error(`Unsupported Xunfei ASR product: ${product}`)
  }

  const now = Date.now()
  const sessionId = config.sessionId ?? `asr_xunfei_${crypto.randomUUID()}`
  const eosMs = Math.min(6000, Math.max(600, config.endpointSilenceMs ?? 900))

  return {
    provider: 'xunfei',
    status: 'created',
    sessionId,
    transport: 'websocket',
    endpointUrl: createAuthUrl(apiKey, apiSecret),
    expiresAt: new Date(now + 4 * 60 * 1000).toISOString(),
    providerConfig: {
      appId,
      domain: 'slm',
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
