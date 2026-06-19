import crypto from 'crypto'
import type { TTSProvider, TTSResult } from './types'
import { requireEnv } from '@/lib/server/env'

function voiceForAccent(accent?: string) {
  const normalized = accent?.toLowerCase() ?? ''
  if (normalized.includes('british')) return process.env.VOLCENGINE_TTS_VOICE_BRITISH || process.env.VOLCENGINE_TTS_VOICE || 'BV001_streaming'
  if (normalized.includes('american')) return process.env.VOLCENGINE_TTS_VOICE_AMERICAN || process.env.VOLCENGINE_TTS_VOICE || 'BV001_streaming'
  return process.env.VOLCENGINE_TTS_VOICE || 'BV001_streaming'
}

export function createVolcengineTTS(): TTSProvider {
  const appId = requireEnv('VOLCENGINE_TTS_APP_ID', 'Volcengine TTS')
  const token = requireEnv('VOLCENGINE_TTS_ACCESS_TOKEN', 'Volcengine TTS')
  const cluster = process.env.VOLCENGINE_TTS_CLUSTER?.trim() || 'volcano_tts'
  const endpoint = process.env.VOLCENGINE_TTS_ENDPOINT?.trim() || 'https://openspeech.bytedance.com/api/v1/tts'

  return {
    async synthesize(text: string, options?: { accent?: string; speed?: number }): Promise<TTSResult> {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer;${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          app: {
            appid: appId,
            token,
            cluster,
          },
          user: {
            uid: 'meteorvoice',
          },
          audio: {
            voice_type: voiceForAccent(options?.accent),
            encoding: 'mp3',
            speed_ratio: options?.speed ?? 1,
          },
          request: {
            reqid: crypto.randomUUID(),
            text,
            operation: 'query',
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`Volcengine TTS request failed: ${response.status}`)
      }

      const data = await response.json() as {
        code?: number
        message?: string
        data?: string
      }

      if (data.code && data.code !== 3000) {
        throw new Error(data.message || `Volcengine TTS failed with code ${data.code}`)
      }
      if (!data.data) throw new Error('Volcengine TTS returned empty audio')

      return {
        audioUrl: `data:audio/mp3;base64,${data.data}`,
        duration: text.length * 0.06,
      }
    },
  }
}
