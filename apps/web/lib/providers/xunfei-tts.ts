import crypto from 'crypto'
import WebSocket from 'ws'
import type { TTSProvider, TTSResult } from './types'
import { resolveXunfeiVoiceForText } from './xunfei-voices'
import { requireEnv } from '@/lib/server/env'

const host = 'tts-api.xfyun.cn'
const path = '/v2/tts'

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

export function createXunfeiTTS(): TTSProvider {
  const appId = requireEnv('XUNFEI_APP_ID', 'Xunfei TTS')
  const apiKey = requireEnv('XUNFEI_API_KEY', 'Xunfei TTS')
  const apiSecret = requireEnv('XUNFEI_API_SECRET', 'Xunfei TTS')

  return {
    synthesize(text: string, options?: { accent?: string; speed?: number; voiceId?: string }): Promise<TTSResult> {
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
              vcn: resolveXunfeiVoiceForText(text, options?.accent, process.env, Date.now(), options?.voiceId),
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
