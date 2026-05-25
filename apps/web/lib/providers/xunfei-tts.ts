import crypto from 'crypto'
import WebSocket from 'ws'
import type { TTSProvider, TTSResult } from './types'

const host = 'tts-api.xfyun.cn'
const path = '/v2/tts'
export const XUNFEI_TRIAL_VOICE_EXPIRES_AT = '2026-06-08T16:00:00.000Z'
export const XUNFEI_TRIAL_VOICE_CATHERINE = 'x4_enus_catherine_profnews'
export const XUNFEI_TRIAL_VOICE_RYAN = 'x4_enus_ryan_assist'
const xunfeiTrialVoices = new Set([XUNFEI_TRIAL_VOICE_CATHERINE, XUNFEI_TRIAL_VOICE_RYAN])

export type XunfeiVoiceInfo = {
  id: string
  name: string
  language: 'en' | 'zh'
  gender: 'male' | 'female'
  tier: 'trial' | 'base'
  expiresAt?: string
}

export type XunfeiConfiguredVoiceInfo = XunfeiVoiceInfo & {
  envKey: string
  usage: string
  status: 'active' | 'expired'
}

export const xunfeiVoiceCatalog: XunfeiVoiceInfo[] = [
  {
    id: XUNFEI_TRIAL_VOICE_CATHERINE,
    name: 'Catherine Professional News',
    language: 'en',
    gender: 'male',
    tier: 'trial',
    expiresAt: XUNFEI_TRIAL_VOICE_EXPIRES_AT,
  },
  {
    id: XUNFEI_TRIAL_VOICE_RYAN,
    name: 'Ryan Assistant',
    language: 'en',
    gender: 'female',
    tier: 'trial',
    expiresAt: XUNFEI_TRIAL_VOICE_EXPIRES_AT,
  },
  { id: 'x4_xiaoyan', name: '讯飞小燕', language: 'zh', gender: 'female', tier: 'base' },
  { id: 'x4_yezi', name: '讯飞小露', language: 'zh', gender: 'female', tier: 'base' },
  { id: 'x4_lingxiaolu_en', name: '讯飞小露', language: 'zh', gender: 'female', tier: 'base' },
  { id: 'aisjiuxu', name: '讯飞许久', language: 'zh', gender: 'male', tier: 'base' },
  { id: 'aisjinger', name: '讯飞小婧', language: 'zh', gender: 'female', tier: 'base' },
  { id: 'aisbabyxu', name: '讯飞许小宝', language: 'zh', gender: 'male', tier: 'base' },
]

const xunfeiVoiceById = new Map(xunfeiVoiceCatalog.map(voice => [voice.id, voice]))

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for Xunfei TTS`)
  return value
}

function createAuthUrl(apiKey: string, apiSecret: string) {
  const date = new Date().toUTCString()
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(signatureOrigin)
    .digest('base64')
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  const authorization = Buffer.from(authorizationOrigin).toString('base64')

  return `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`
}

type XunfeiVoiceEnv = Record<string, string | undefined>

function readEnvVoice(env: XunfeiVoiceEnv, key: keyof XunfeiVoiceEnv) {
  return env[key]?.trim() || undefined
}

function isExpiredTrialVoice(voice: string, nowMs: number) {
  return xunfeiTrialVoices.has(voice) && nowMs >= Date.parse(XUNFEI_TRIAL_VOICE_EXPIRES_AT)
}

function voiceInfoFor(id: string): XunfeiVoiceInfo {
  return xunfeiVoiceById.get(id) ?? {
    id,
    name: id,
    language: 'en',
    gender: 'female',
    tier: 'base',
  }
}

export function getConfiguredXunfeiVoices(env: XunfeiVoiceEnv = process.env, nowMs = Date.now()): XunfeiConfiguredVoiceInfo[] {
  const configured = [
    { envKey: 'XUNFEI_TTS_VOICE', usage: 'Default', value: readEnvVoice(env, 'XUNFEI_TTS_VOICE') },
    { envKey: 'XUNFEI_TTS_VOICE_AMERICAN', usage: 'American English', value: readEnvVoice(env, 'XUNFEI_TTS_VOICE_AMERICAN') },
    { envKey: 'XUNFEI_TTS_VOICE_BRITISH', usage: 'British English', value: readEnvVoice(env, 'XUNFEI_TTS_VOICE_BRITISH') },
    { envKey: 'XUNFEI_TTS_VOICE_INDIAN', usage: 'Indian English', value: readEnvVoice(env, 'XUNFEI_TTS_VOICE_INDIAN') },
  ]

  return configured.flatMap(item => {
    if (!item.value) return []
    const info = voiceInfoFor(item.value)
    return [{
      ...info,
      envKey: item.envKey,
      usage: item.usage,
      status: isExpiredTrialVoice(item.value, nowMs) ? 'expired' : 'active',
    } satisfies XunfeiConfiguredVoiceInfo]
  })
}

export function hasXunfeiVoiceConfig(env: XunfeiVoiceEnv = process.env, nowMs = Date.now()) {
  try {
    resolveXunfeiVoiceForAccent('american', env, nowMs)
    return true
  } catch {
    return false
  }
}

export function resolveXunfeiVoiceForAccent(accent?: string, env: XunfeiVoiceEnv = process.env, nowMs = Date.now()) {
  const normalized = accent?.toLowerCase() ?? ''
  const fallback = readEnvVoice(env, 'XUNFEI_TTS_VOICE')
  const voice = normalized.includes('british')
    ? readEnvVoice(env, 'XUNFEI_TTS_VOICE_BRITISH') ?? fallback
    : normalized.includes('indian')
      ? readEnvVoice(env, 'XUNFEI_TTS_VOICE_INDIAN') ?? fallback
      : normalized.includes('american')
        ? readEnvVoice(env, 'XUNFEI_TTS_VOICE_AMERICAN') ?? fallback
        : fallback

  if (!voice) {
    throw new Error('XUNFEI_TTS_VOICE is required for Xunfei TTS. Configure a V3-compatible vcn from the Xunfei console, or an accent-specific override such as XUNFEI_TTS_VOICE_AMERICAN.')
  }

  if (isExpiredTrialVoice(voice, nowMs)) {
    throw new Error(`Xunfei trial voice "${voice}" expired at 2026-06-09 00:00 Asia/Shanghai. Configure a purchased V3-compatible vcn before using Xunfei TTS.`)
  }

  return voice
}

export function createXunfeiTTS(): TTSProvider {
  const appId = requireEnv('XUNFEI_APP_ID')
  const apiKey = requireEnv('XUNFEI_API_KEY')
  const apiSecret = requireEnv('XUNFEI_API_SECRET')

  return {
    synthesize(text: string, options?: { accent?: string; speed?: number }): Promise<TTSResult> {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(createAuthUrl(apiKey, apiSecret))
        const chunks: Buffer[] = []
        const timeout = setTimeout(() => {
          ws.close()
          reject(new Error('Xunfei TTS timed out'))
        }, 20000)

        ws.on('open', () => {
          ws.send(JSON.stringify({
            common: { app_id: appId },
            business: {
              aue: 'lame',
              sfl: 1,
              vcn: resolveXunfeiVoiceForAccent(options?.accent),
              speed: Math.round(Math.min(100, Math.max(0, options?.speed ?? 70))),
              volume: 50,
              pitch: 50,
              bgs: 0,
              tte: 'UTF8',
            },
            data: {
              status: 2,
              text: Buffer.from(text, 'utf8').toString('base64'),
            },
          }))
        })

        ws.on('message', raw => {
          const message = JSON.parse(raw.toString()) as {
            code: number
            message?: string
            data?: { audio?: string; status?: number }
          }

          if (message.code !== 0) {
            clearTimeout(timeout)
            ws.close()
            reject(new Error(message.message || `Xunfei TTS failed with code ${message.code}`))
            return
          }

          if (message.data?.audio) {
            chunks.push(Buffer.from(message.data.audio, 'base64'))
          }

          if (message.data?.status === 2) {
            clearTimeout(timeout)
            ws.close()
            const audio = Buffer.concat(chunks).toString('base64')
            resolve({
              audioUrl: `data:audio/mp3;base64,${audio}`,
              duration: text.length * 0.06,
            })
          }
        })

        ws.on('error', error => {
          clearTimeout(timeout)
          reject(error)
        })
      })
    },
  }
}
