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
