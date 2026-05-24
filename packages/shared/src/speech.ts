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
  synthesize(text: string, options?: { accent?: string; speed?: number }): Promise<TTSResult>
}

const sentenceBoundaryPattern = /[^.!?。！？]+[.!?。！？]+(?:["'”’)]*)?|[^.!?。！？]+$/g
const whitespacePattern = /\s+/g

export interface SpokenSegmentOptions {
  maxSegments?: number
  maxCharsPerSegment?: number
}

export function splitSpokenText(text: string, options: SpokenSegmentOptions = {}): string[] {
  const normalized = text.replace(whitespacePattern, ' ').trim()
  if (!normalized) return []

  const maxSegments = options.maxSegments ?? 4
  const maxCharsPerSegment = options.maxCharsPerSegment ?? 60
  const rawSentences = normalized
    .match(sentenceBoundaryPattern)
    ?.map(segment => segment.trim())
    .filter(Boolean) ?? [normalized]

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
} as const

export type TTSProviderKey = keyof typeof ttsProviderCapabilities

const calibratedNormalSpeechRate = 1.2
const xunfeiMinSpeed = 50
const xunfeiNormalSpeed = 70
const xunfeiMaxSpeed = 100

function normalizeSpeedMultiplier(speed: number) {
  if (!Number.isFinite(speed)) return 1
  return Math.min(1.5, Math.max(0.75, speed))
}

function mapXunfeiSpeed(speed: number) {
  const normalized = normalizeSpeedMultiplier(speed)
  if (normalized <= 1) {
    const progress = (normalized - 0.75) / 0.25
    return Math.round(xunfeiMinSpeed + ((xunfeiNormalSpeed - xunfeiMinSpeed) * progress))
  }

  const progress = (normalized - 1) / 0.5
  return Math.round(xunfeiNormalSpeed + ((xunfeiMaxSpeed - xunfeiNormalSpeed) * progress))
}

export function supportsAccent(provider: string, accent: string): boolean {
  const capabilities = ttsProviderCapabilities[provider as TTSProviderKey]
  if (!capabilities) return false
  return (capabilities.accents as readonly string[]).includes(accent)
}

export function getTTSSpeedRouting(provider: string, speed = 1): { serverSpeed: number; playbackRate: number } {
  const capabilities = ttsProviderCapabilities[provider as TTSProviderKey]
  const normalizedSpeed = normalizeSpeedMultiplier(speed)
  if (capabilities?.speedControl === 'provider') {
    return { serverSpeed: provider === 'xunfei' ? mapXunfeiSpeed(normalizedSpeed) : normalizedSpeed, playbackRate: 1 }
  }

  return { serverSpeed: 1, playbackRate: normalizedSpeed * calibratedNormalSpeechRate }
}
