/**
 * Xunfei TTS provider.
 * 讯飞语音合成提供者。
 */

import crypto from 'crypto'
import WebSocket from 'ws'

import type {
  TTSProvider,
  TTSResult,
} from './types'
import { resolveXunfeiVoiceForText } from './xunfei-voices'

const host = 'tts-api.xfyun.cn'
const path = '/v2/tts'
const xunfeiMinSpeed = 50
const xunfeiNormalSpeed = 55
const xunfeiMaxSpeed = 80

type XunfeiTTSEnvironment = Record<string, string | undefined>

type XunfeiTTSConnection = {
  appId: string
  headers?: Record<string, string>
  url: string
}

function readCredential(value?: string) {
  return value?.trim() || null
}

export function mapXunfeiSpeedMultiplier(speed = 1) {
  const normalized = Math.min(1.5, Math.max(0.75, Number.isFinite(speed) ? speed : 1))
  if (normalized <= 1) {
    const progress = (normalized - 0.75) / 0.25
    return Math.round(xunfeiMinSpeed + ((xunfeiNormalSpeed - xunfeiMinSpeed) * progress))
  }

  const progress = (normalized - 1) / 0.5
  return Math.round(xunfeiNormalSpeed + ((xunfeiMaxSpeed - xunfeiNormalSpeed) * progress))
}

export function hasXunfeiTTSCredentials(env: XunfeiTTSEnvironment = process.env) {
  const appId = readCredential(env.XUNFEI_APP_ID)
  const apiPassword = readCredential(env.XUNFEI_API_PASSWORD)
  const apiKey = readCredential(env.XUNFEI_API_KEY)
  const apiSecret = readCredential(env.XUNFEI_API_SECRET)
  return Boolean(appId && (apiPassword || (apiKey && apiSecret)))
}

function createAuthUrl(apiKey: string, apiSecret: string, now: Date) {
  const date = now.toUTCString()
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(signatureOrigin)
    .digest('base64')
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  const authorization = Buffer.from(authorizationOrigin).toString('base64')

  return `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`
}

export function resolveXunfeiTTSConnection(
  env: XunfeiTTSEnvironment = process.env,
  now = new Date(),
): XunfeiTTSConnection {
  const appId = readCredential(env.XUNFEI_APP_ID)
  if (!appId) throw new Error('Missing XUNFEI_APP_ID for Xunfei TTS')

  const apiPassword = readCredential(env.XUNFEI_API_PASSWORD)
  if (apiPassword) {
    return {
      appId,
      headers: { 'x-api-key': apiPassword },
      url: `wss://${host}${path}`,
    }
  }

  const apiKey = readCredential(env.XUNFEI_API_KEY)
  const apiSecret = readCredential(env.XUNFEI_API_SECRET)
  if (!apiKey || !apiSecret) {
    throw new Error('Missing XUNFEI_API_PASSWORD or XUNFEI_API_KEY/XUNFEI_API_SECRET for Xunfei TTS')
  }

  return { appId, url: createAuthUrl(apiKey, apiSecret, now) }
}

/**
 * Create a Xunfei (iFlytek) Text-to-Speech provider using the WebSocket streaming TTS API v2.
 * 创建讯飞（科大讯飞）文本转语音提供者，使用 WebSocket 流式 TTS API v2。
 */
export function createXunfeiTTS(): TTSProvider {
  const connection = resolveXunfeiTTSConnection()

  return {
    synthesize(text: string, options?: { accent?: string; speed?: number; voiceId?: string }): Promise<TTSResult> {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(connection.url, connection.headers ? { headers: connection.headers } : undefined)
        const chunks: Buffer[] = []
        const timeout = setTimeout(() => {
          ws.close()
          reject(new Error('Xunfei TTS timed out'))
        }, 20000)

        ws.on('open', () => {
          ws.send(JSON.stringify({
            common: { app_id: connection.appId },
            business: {
              aue: 'lame',
              sfl: 1,
              vcn: resolveXunfeiVoiceForText(text, options?.accent, process.env, Date.now(), options?.voiceId),
              speed: mapXunfeiSpeedMultiplier(options?.speed),
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
