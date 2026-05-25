import { describe, expect, it } from 'vitest'
import { hasXunfeiVoiceConfig, resolveXunfeiVoiceForAccent } from '@/lib/providers/xunfei-tts'

describe('Xunfei TTS voice config', () => {
  it('requires an explicit voice vcn', () => {
    expect(() => resolveXunfeiVoiceForAccent('American', {})).toThrow('XUNFEI_TTS_VOICE is required')
    expect(hasXunfeiVoiceConfig({})).toBe(false)
  })

  it('uses the generic V3 voice as fallback', () => {
    expect(resolveXunfeiVoiceForAccent('American', {
      XUNFEI_TTS_VOICE: 'x5_example_v3_voice',
    })).toBe('x5_example_v3_voice')
    expect(hasXunfeiVoiceConfig({
      XUNFEI_TTS_VOICE: 'x5_example_v3_voice',
    })).toBe(true)
  })

  it('prefers accent-specific voice overrides', () => {
    expect(resolveXunfeiVoiceForAccent('American English', {
      XUNFEI_TTS_VOICE: 'x5_default_v3_voice',
      XUNFEI_TTS_VOICE_AMERICAN: 'x5_american_v3_voice',
    })).toBe('x5_american_v3_voice')
  })
})
