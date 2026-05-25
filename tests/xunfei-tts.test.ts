import { describe, expect, it } from 'vitest'
import {
  XUNFEI_TRIAL_VOICE_CATHERINE,
  XUNFEI_TRIAL_VOICE_EXPIRES_AT,
  XUNFEI_TRIAL_VOICE_RYAN,
  getConfiguredXunfeiVoices,
  hasXunfeiVoiceConfig,
  resolveXunfeiVoiceForAccent,
} from '@/lib/providers/xunfei-tts'

const beforeTrialExpiry = Date.parse(XUNFEI_TRIAL_VOICE_EXPIRES_AT) - 1
const afterTrialExpiry = Date.parse(XUNFEI_TRIAL_VOICE_EXPIRES_AT)

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

  it('allows configured trial voices before their expiry', () => {
    expect(resolveXunfeiVoiceForAccent('American English', {
      XUNFEI_TTS_VOICE: XUNFEI_TRIAL_VOICE_CATHERINE,
      XUNFEI_TTS_VOICE_AMERICAN: XUNFEI_TRIAL_VOICE_RYAN,
    }, beforeTrialExpiry)).toBe(XUNFEI_TRIAL_VOICE_RYAN)
    expect(hasXunfeiVoiceConfig({
      XUNFEI_TTS_VOICE: XUNFEI_TRIAL_VOICE_CATHERINE,
    }, beforeTrialExpiry)).toBe(true)
  })

  it('rejects configured trial voices after their expiry', () => {
    expect(() => resolveXunfeiVoiceForAccent('American English', {
      XUNFEI_TTS_VOICE: XUNFEI_TRIAL_VOICE_CATHERINE,
      XUNFEI_TTS_VOICE_AMERICAN: XUNFEI_TRIAL_VOICE_RYAN,
    }, afterTrialExpiry)).toThrow('expired at 2026-06-09 00:00 Asia/Shanghai')
    expect(hasXunfeiVoiceConfig({
      XUNFEI_TTS_VOICE: XUNFEI_TRIAL_VOICE_CATHERINE,
    }, afterTrialExpiry)).toBe(false)
  })

  it('allows non-trial V3 voices after trial expiry', () => {
    expect(resolveXunfeiVoiceForAccent('American English', {
      XUNFEI_TTS_VOICE: 'x5_purchased_v3_voice',
    }, afterTrialExpiry)).toBe('x5_purchased_v3_voice')
  })

  it('reports configured Xunfei voices for settings', () => {
    expect(getConfiguredXunfeiVoices({
      XUNFEI_TTS_VOICE: XUNFEI_TRIAL_VOICE_CATHERINE,
      XUNFEI_TTS_VOICE_AMERICAN: XUNFEI_TRIAL_VOICE_RYAN,
      XUNFEI_TTS_VOICE_BRITISH: 'aisjiuxu',
    }, beforeTrialExpiry)).toMatchObject([
      {
        envKey: 'XUNFEI_TTS_VOICE',
        id: XUNFEI_TRIAL_VOICE_CATHERINE,
        language: 'en',
        gender: 'male',
        tier: 'trial',
        status: 'active',
      },
      {
        envKey: 'XUNFEI_TTS_VOICE_AMERICAN',
        id: XUNFEI_TRIAL_VOICE_RYAN,
        language: 'en',
        gender: 'female',
        tier: 'trial',
        status: 'active',
      },
      {
        envKey: 'XUNFEI_TTS_VOICE_BRITISH',
        id: 'aisjiuxu',
        language: 'zh',
        gender: 'male',
        tier: 'base',
        status: 'active',
      },
    ])
  })
})
