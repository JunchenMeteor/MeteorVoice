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

export function supportsAccent(provider: string, accent: string) {
  const capabilities = ttsProviderCapabilities[provider as TTSProviderKey]
  if (!capabilities) return false
  return (capabilities.accents as readonly string[]).includes(accent)
}
