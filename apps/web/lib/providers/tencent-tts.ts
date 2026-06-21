/**
 * Tencent TTS provider.
 * 腾讯云语音合成提供者。
 */

import crypto from 'crypto'

import type {
  TTSProvider,
  TTSResult,
} from './types'
import { requireEnv } from '@/lib/server/env'

const service = 'tts'
const host = 'tts.tencentcloudapi.com'
const endpoint = `https://${host}`
const version = '2019-08-23'
const action = 'TextToVoice'

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function hmac(key: crypto.BinaryLike, value: string) {
  return crypto.createHmac('sha256', key).update(value).digest()
}

function sign(secretId: string, secretKey: string, payload: string, timestamp: number) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`
  const signedHeaders = 'content-type;host'
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    sha256(payload),
  ].join('\n')
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = [
    'TC3-HMAC-SHA256',
    timestamp,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n')
  const secretDate = hmac(`TC3${secretKey}`, date)
  const secretService = hmac(secretDate, service)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
}

function voiceForAccent(accent?: string) {
  const normalized = accent?.toLowerCase() ?? ''
  if (normalized.includes('british')) return Number(process.env.TENCENT_TTS_VOICE_BRITISH || process.env.TENCENT_TTS_VOICE || 101001)
  if (normalized.includes('american')) return Number(process.env.TENCENT_TTS_VOICE_AMERICAN || process.env.TENCENT_TTS_VOICE || 101001)
  return Number(process.env.TENCENT_TTS_VOICE || 101001)
}

/**
 * Create a Tencent Cloud Text-to-Speech provider using TC3-HMAC-SHA256 signing.
 * 创建使用 TC3-HMAC-SHA256 签名的腾讯云文本转语音提供者。
 */
export function createTencentTTS(): TTSProvider {
  const secretId = requireEnv('TENCENT_SECRET_ID', 'Tencent TTS')
  const secretKey = requireEnv('TENCENT_SECRET_KEY', 'Tencent TTS')
  const region = process.env.TENCENT_TTS_REGION?.trim() || 'ap-guangzhou'

  return {
    async synthesize(text: string, options?: { accent?: string; speed?: number }): Promise<TTSResult> {
      const timestamp = Math.floor(Date.now() / 1000)
      const payload = JSON.stringify({
        Text: text,
        SessionId: crypto.randomUUID(),
        ModelType: 1,
        VoiceType: voiceForAccent(options?.accent),
        Codec: 'mp3',
        Speed: options?.speed ?? 0,
      })

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': sign(secretId, secretKey, payload, timestamp),
          'Content-Type': 'application/json; charset=utf-8',
          'Host': host,
          'X-TC-Action': action,
          'X-TC-Region': region,
          'X-TC-Timestamp': String(timestamp),
          'X-TC-Version': version,
        },
        body: payload,
      })

      if (!response.ok) {
        throw new Error(`Tencent TTS request failed: ${response.status}`)
      }

      const data = await response.json() as {
        Response?: {
          Audio?: string
          Error?: { Code?: string; Message?: string }
        }
      }
      if (data.Response?.Error) {
        throw new Error(data.Response.Error.Message || data.Response.Error.Code || 'Tencent TTS failed')
      }
      if (!data.Response?.Audio) throw new Error('Tencent TTS returned empty audio')

      return {
        audioUrl: `data:audio/mp3;base64,${data.Response.Audio}`,
        duration: text.length * 0.06,
      }
    },
  }
}
