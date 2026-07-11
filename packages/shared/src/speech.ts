/**
 * STT/TTS provider interfaces, TTS speed routing, capability types.
 * STT/TTS 提供者接口、语速路由、能力类型。
 */
export interface STTResult {
  transcript: string
  confidence: number
}

export interface TTSResult {
  audioUrl: string
  duration: number
}

export interface STTProvider {
  transcribe(
    audioBlob: Blob,
    options?: {
      signal?: AbortSignal
      language?: string
      getVoiceActivity?: () => {
        lastVoiceAt: number | null
        noiseFloor: number
        level: number | null
        peakLevel: number
        smoothedPeakLevel: number
        threshold: number
        isVoiceActive: boolean
      } | null
    },
  ): Promise<STTResult>
}

export interface TTSProvider {
  synthesize(text: string, options?: { accent?: string; speed?: number; voiceId?: string }): Promise<TTSResult>
}

export type VoiceProfileStatus = 'active' | 'expired' | 'unavailable'

export type VoiceProfile = {
  id: string
  provider: TTSProviderKey
  providerVoiceId: string | null
  displayName: string
  displayNameZh?: string
  description?: string
  descriptionZh?: string
  locale: 'en' | 'zh'
  accentKey: string
  accentLabel?: string
  accentRegion?: string
  gender?: 'male' | 'female'
  style?: string
  qualityTier?: 'base' | 'featured'
  expiresAt?: string
  status: VoiceProfileStatus
}

const whitespacePattern = /\s+/g
const sentenceTerminators = new Set(['.', '!', '?', '。', '！', '？'])
const closingPunctuation = new Set(['"', "'", '”', '’', ')'])

export interface SpokenSegmentOptions {
  maxSegments?: number
  maxCharsPerSegment?: number
}

/**
 * Splits spoken text into segments suitable for TTS playback, respecting sentence boundaries and length limits.
 * 将口播文本按句子边界和长度限制分割为适合 TTS 播放的片段。
 */
export function splitSpokenText(text: string, options: SpokenSegmentOptions = {}): string[] {
  const normalized = text.replace(whitespacePattern, ' ').trim()
  if (!normalized) return []

  const maxSegments = options.maxSegments ?? 4
  const maxCharsPerSegment = options.maxCharsPerSegment ?? 60
  const rawSentences = splitSentences(normalized)

  const segments: string[] = []

  for (let index = 0; index < rawSentences.length; index += 1) {
    const sentence = rawSentences[index]
    if (!segments.length || (segments[segments.length - 1].length + 1 + sentence.length) > maxCharsPerSegment) {
      segments.push(sentence)
    } else {
      segments[segments.length - 1] = `${segments[segments.length - 1]} ${sentence}`
    }

    if (segments.length >= maxSegments) {
      const remaining = rawSentences.slice(index + 1).join(' ').trim()
      if (remaining) {
        segments[segments.length - 1] = `${segments[segments.length - 1]} ${remaining}`.trim()
      }
      break
    }
  }

  return segments
}

function splitSentences(text: string): string[] {
  const sentences: string[] = []
  let start = 0
  let index = 0

  while (index < text.length) {
    if (!sentenceTerminators.has(text[index])) {
      index += 1
      continue
    }

    index += 1
    while (index < text.length && closingPunctuation.has(text[index])) {
      index += 1
    }

    const sentence = text.slice(start, index).trim()
    if (sentence) sentences.push(sentence)
    start = index
  }

  const trailing = text.slice(start).trim()
  if (trailing) sentences.push(trailing)
  return sentences.length ? sentences : [text]
}

/**
 * Declares the accent and speed-control capabilities of each TTS provider.
 * 声明每个 TTS 提供商支持的口音和语速控制能力。
 */
export const ttsProviderCapabilities = {
  mock: {
    accents: ['british', 'american', 'indian', 'australian', 'singapore', 'african'],
    speedControl: 'client' as const,
  },
  xunfei: {
    accents: ['american'],
    speedControl: 'provider' as const,
  },
  volcengine: {
    accents: ['american'],
    speedControl: 'client' as const,
  },
  tencent: {
    accents: ['american'],
    speedControl: 'client' as const,
  },
  azure: {
    accents: ['american', 'british', 'australian', 'indian', 'singapore', 'african'],
    speedControl: 'client' as const,
  },
} as const

export type TTSProviderKey = keyof typeof ttsProviderCapabilities

const calibratedNormalSpeechRate = 1.2

function normalizeSpeedMultiplier(speed: number) {
  if (!Number.isFinite(speed)) return 1
  return Math.min(1.5, Math.max(0.75, speed))
}

/**
 * Checks whether a TTS provider supports a given accent.
 * 检查某个 TTS 提供商是否支持指定的口音。
 */
export function supportsAccent(provider: string, accent: string): boolean {
  const capabilities = ttsProviderCapabilities[provider as TTSProviderKey]
  if (!capabilities) return false
  return (capabilities.accents as readonly string[]).includes(accent)
}

/**
 * Computes the normalized API speed and client playback rate based on the desired speed multiplier.
 * 根据所需语速倍率，计算统一 API 语速和客户端播放速率。
 */
export function getTTSSpeedRouting(provider: string, speed = 1): { requestSpeed: number; playbackRate: number } {
  const capabilities = ttsProviderCapabilities[provider as TTSProviderKey]
  const normalizedSpeed = normalizeSpeedMultiplier(speed)
  if (capabilities?.speedControl === 'provider') {
    return { requestSpeed: normalizedSpeed, playbackRate: 1 }
  }

  return { requestSpeed: 1, playbackRate: normalizedSpeed * calibratedNormalSpeechRate }
}
