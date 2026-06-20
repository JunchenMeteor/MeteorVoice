/**
 * TTS speech synthesis orchestration. / TTS 语音合成编排。
 */
import { createMockTTS } from '@/lib/providers/mock-tts'
import { createTencentTTS } from '@/lib/providers/tencent-tts'
import { createVolcengineTTS } from '@/lib/providers/volcengine-tts'
import { createXunfeiTTS } from '@/lib/providers/xunfei-tts'
import { createAzureTTS } from '@/lib/providers/azure-tts'
import type { TTSProvider, TTSResult } from '@/lib/providers/types'
import { getAvailableProviders, normalizeTTSProvider } from './preferences'
import type { TTSProviderPreference } from './preferences'

function createProvider(provider: TTSProviderPreference): TTSProvider {
  if (provider === 'xunfei') return createXunfeiTTS()
  if (provider === 'volcengine') return createVolcengineTTS()
  if (provider === 'tencent') return createTencentTTS()
  if (provider === 'azure') return createAzureTTS()
  return createMockTTS()
}

export async function synthesizeSpeech(
  text: string,
  options?: { accent?: string; speed?: number; provider?: string; voiceId?: string },
): Promise<TTSResult> {
  const requestedProvider = normalizeTTSProvider(options?.provider ?? process.env.TTS_PROVIDER)
  const provider = getAvailableProviders().includes(requestedProvider) ? requestedProvider : 'mock'
  return createProvider(provider).synthesize(text, {
    accent: options?.accent,
    speed: options?.speed,
    voiceId: options?.voiceId,
  })
}

export async function synthesizeSpeechFromRequest(input: {
  text?: string
  accent?: string
  speed?: number
  provider?: string
  voiceId?: string
}) {
  if (!input.text?.trim()) {
    return { error: 'Text is required', status: 400 as const }
  }

  return synthesizeSpeech(input.text, input)
}
