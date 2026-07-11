/**
 * Xunfei ASR WebSocket frame parsing.
 * 讯飞 ASR WebSocket 帧解析。
 */

import type { CreateASRSessionResponse } from '@meteorvoice/api-client'

export function createXunfeiASRFrame(session: CreateASRSessionResponse, status: 0 | 1 | 2, audioBase64: string, sequence: number) {
  const providerConfig = session.providerConfig
  const header = {
    app_id: providerConfig?.appId,
    status,
  }
  const audio = {
    encoding: providerConfig?.audioEncoding ?? 'raw',
    sample_rate: providerConfig?.sampleRate ?? 16000,
    channels: providerConfig?.channels ?? 1,
    bit_depth: providerConfig?.bitDepth ?? 16,
    seq: sequence,
    status,
    audio: audioBase64,
  }
  if (status !== 0) {
    return {
      header,
      payload: { audio },
    }
  }

  return {
    header,
    parameter: {
      iat: {
        domain: providerConfig?.domain ?? 'iat',
        language: providerConfig?.language ?? 'zh_cn',
        accent: providerConfig?.accent ?? 'mandarin',
        eos: providerConfig?.eosMs ?? 900,
        dwa: 'wpgs',
        result: {
          encoding: 'utf8',
          compress: 'raw',
          format: 'json',
        },
      },
    },
    payload: { audio },
  }
}

export function extractXunfeiRecognitionResult(payload: Record<string, unknown> | null) {
  const payloadObject = getObject(payload?.payload)
  const payloadResult = getObject(payloadObject?.result)
  const encodedText = typeof payloadResult?.text === 'string' ? payloadResult.text : null
  if (encodedText) {
    const decoded = decodeBase64Utf8(encodedText)
    const decodedPayload = parseJsonObject(decoded)
    const decodedWords = extractXunfeiWords(decodedPayload?.ws)
    if (decodedWords) {
      const rg = Array.isArray(decodedPayload?.rg) &&
        typeof decodedPayload.rg[0] === 'number' &&
        typeof decodedPayload.rg[1] === 'number'
        ? [decodedPayload.rg[0], decodedPayload.rg[1]] as [number, number]
        : null
      return {
        text: decodedWords,
        sn: typeof decodedPayload?.sn === 'number' ? decodedPayload.sn : null,
        pgs: typeof decodedPayload?.pgs === 'string' ? decodedPayload.pgs : null,
        rg,
      }
    }
  }

  const data = getObject(payload?.data)
  const result = getObject(data?.result)
  const fallbackWords = extractXunfeiWords(result?.ws)
  return fallbackWords
    ? { text: fallbackWords, sn: null, pgs: null, rg: null }
    : null
}

export function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function extractXunfeiWords(words: unknown) {
  if (!Array.isArray(words)) return ''
  return words.map(item => {
    const word = getObject(item)
    const candidates = word?.cw
    if (!Array.isArray(candidates)) return ''
    return candidates.map(candidate => {
      const candidateObject = getObject(candidate)
      return typeof candidateObject?.w === 'string' ? candidateObject.w : ''
    }).join('')
  }).join('')
}

function decodeBase64Utf8(value: string) {
  try {
    const decoder = globalThis.atob
    if (!decoder) return ''
    const binary = decoder(value)
    const escaped = Array.from(binary)
      .map(char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('')
    return decodeURIComponent(escaped)
  } catch {
    return ''
  }
}
