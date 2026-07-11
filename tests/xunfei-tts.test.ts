import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  getConfiguredXunfeiVoices,
  hasXunfeiVoiceConfig,
  resolveXunfeiVoiceForAccent,
  resolveXunfeiVoiceForText,
  XUNFEI_TRIAL_VOICE_CATHERINE,
  XUNFEI_TRIAL_VOICE_EXPIRES_AT,
  XUNFEI_TRIAL_VOICE_RYAN,
  XUNFEI_TRIAL_VOICE_YEZI,
} from '@/lib/providers/xunfei-voices'
import { resolveXunfeiTTSConnection } from '@/lib/providers/xunfei-tts'

const beforeTrialExpiry = Date.parse(XUNFEI_TRIAL_VOICE_EXPIRES_AT) - 1
const afterTrialExpiry = Date.parse(XUNFEI_TRIAL_VOICE_EXPIRES_AT)

describe('Xunfei TTS voice config', () => {
  it('uses the active catalog default when no fallback env is configured', () => {
    expect(resolveXunfeiVoiceForAccent('American', {}, beforeTrialExpiry, XUNFEI_TRIAL_VOICE_RYAN)).toBe(XUNFEI_TRIAL_VOICE_RYAN)
    expect(hasXunfeiVoiceConfig({}, beforeTrialExpiry)).toBe(true)
  })

  it('uses the generic V3 voice as fallback', () => {
    expect(resolveXunfeiVoiceForAccent('American', {
      XUNFEI_TTS_VOICE: 'x5_example_v3_voice',
    })).toBe('x5_example_v3_voice')
    expect(hasXunfeiVoiceConfig({
      XUNFEI_TTS_VOICE: 'x5_example_v3_voice',
    })).toBe(true)
  })

  it('does not use deprecated accent-specific voice overrides', () => {
    expect(resolveXunfeiVoiceForAccent('American English', {
      XUNFEI_TTS_VOICE: 'x5_default_v3_voice',
      XUNFEI_TTS_VOICE_AMERICAN: 'x5_american_v3_voice',
    })).toBe('x5_default_v3_voice')
  })

  it('allows configured trial voices before their expiry', () => {
    expect(resolveXunfeiVoiceForAccent('American English', {
      XUNFEI_TTS_VOICE: XUNFEI_TRIAL_VOICE_CATHERINE,
    }, beforeTrialExpiry, XUNFEI_TRIAL_VOICE_RYAN)).toBe(XUNFEI_TRIAL_VOICE_RYAN)
    expect(hasXunfeiVoiceConfig({
      XUNFEI_TTS_VOICE: XUNFEI_TRIAL_VOICE_CATHERINE,
    }, beforeTrialExpiry)).toBe(true)
  })

  it('rejects configured trial voices after their expiry', () => {
    expect(() => resolveXunfeiVoiceForAccent('American English', {
      XUNFEI_TTS_VOICE: XUNFEI_TRIAL_VOICE_CATHERINE,
    }, afterTrialExpiry, XUNFEI_TRIAL_VOICE_RYAN)).toThrow(/expired at/)
  })

  it('allows non-trial V3 voices after trial expiry', () => {
    expect(resolveXunfeiVoiceForAccent('American English', {
      XUNFEI_TTS_VOICE: 'x5_purchased_v3_voice',
    }, afterTrialExpiry)).toBe('x5_purchased_v3_voice')
  })

  it('reports configured Xunfei voices for settings', () => {
    expect(getConfiguredXunfeiVoices({
      XUNFEI_TTS_VOICE: XUNFEI_TRIAL_VOICE_CATHERINE,
    }, beforeTrialExpiry)).toMatchObject([
      {
        envKey: 'XUNFEI_TTS_VOICE',
        id: XUNFEI_TRIAL_VOICE_CATHERINE,
        language: 'en',
        gender: 'female',
        tier: 'featured',
        status: 'active',
      },
    ])
  })

  it('routes Chinese text away from English-only voices', () => {
    expect(resolveXunfeiVoiceForText(
      '你好，可以继续练习这个表达。',
      'American English',
      {},
      beforeTrialExpiry,
      XUNFEI_TRIAL_VOICE_RYAN,
    )).toBe(XUNFEI_TRIAL_VOICE_YEZI)
  })

  it('keeps selected English voices for English text', () => {
    expect(resolveXunfeiVoiceForText(
      'That sounds good. You can say it more naturally.',
      'American English',
      {},
      beforeTrialExpiry,
      XUNFEI_TRIAL_VOICE_RYAN,
    )).toBe(XUNFEI_TRIAL_VOICE_RYAN)
  })
})

describe('Xunfei TTS authentication', () => {
  it('prefers API password authentication when configured', () => {
    expect(resolveXunfeiTTSConnection({
      XUNFEI_APP_ID: 'app-id',
      XUNFEI_API_PASSWORD: 'ak_password',
      XUNFEI_API_KEY: 'legacy-key',
      XUNFEI_API_SECRET: 'legacy-secret',
    })).toEqual({
      appId: 'app-id',
      headers: { 'x-api-key': 'ak_password' },
      url: 'wss://tts-api.xfyun.cn/v2/tts',
    })
  })

  it('falls back to signed URL authentication', () => {
    const connection = resolveXunfeiTTSConnection({
      XUNFEI_APP_ID: 'app-id',
      XUNFEI_API_KEY: 'legacy-key',
      XUNFEI_API_SECRET: 'legacy-secret',
    }, new Date('2026-07-11T05:00:00.000Z'))

    expect(connection.appId).toBe('app-id')
    expect(connection.headers).toBeUndefined()
    expect(connection.url).toContain('wss://tts-api.xfyun.cn/v2/tts?authorization=')
  })
})
