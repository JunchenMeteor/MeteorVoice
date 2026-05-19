import { createMockTTS } from './mock-tts'
import type { TTSProvider } from './types'
import { createTencentTTS } from './tencent-tts'
import { createVolcengineTTS } from './volcengine-tts'
import { createXunfeiTTS } from './xunfei-tts'

export type TTSProviderName = 'mock' | 'xunfei' | 'volcengine' | 'tencent'

function normalizeProvider(provider?: string): TTSProviderName {
  if (provider === 'xunfei' || provider === 'volcengine' || provider === 'tencent') return provider
  return 'mock'
}

export function createServerTTS(providerOverride?: string): TTSProvider {
  const provider = normalizeProvider((providerOverride ?? process.env.TTS_PROVIDER ?? 'mock').toLowerCase())

  if (provider === 'xunfei') return createXunfeiTTS()
  if (provider === 'volcengine') return createVolcengineTTS()
  if (provider === 'tencent') return createTencentTTS()
  return createMockTTS()
}
