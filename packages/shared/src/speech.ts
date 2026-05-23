export interface STTResult {
  transcript: string
  confidence: number
}

export interface TTSResult {
  audioUrl: string
  duration: number
}

export interface STTProvider {
  transcribe(audioBlob: Blob, options?: { signal?: AbortSignal }): Promise<STTResult>
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
  },
  xunfei: {
    accents: ['american'],
  },
  volcengine: {
    accents: ['american'],
  },
  tencent: {
    accents: ['american'],
  },
} as const

export type TTSProviderKey = keyof typeof ttsProviderCapabilities

export function supportsAccent(provider: string, accent: string): boolean {
  const capabilities = ttsProviderCapabilities[provider as TTSProviderKey]
  if (!capabilities) return false
  return (capabilities.accents as readonly string[]).includes(accent)
}
