import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest'

import { resolveTTSProviderPreference } from '@/lib/server/preferences'

describe('resolveTTSProviderPreference', () => {
  const originalProvider = process.env.TTS_PROVIDER
  const originalXunfeiAppId = process.env.XUNFEI_APP_ID
  const originalXunfeiApiKey = process.env.XUNFEI_API_KEY
  const originalXunfeiApiSecret = process.env.XUNFEI_API_SECRET
  const originalXunfeiApiPassword = process.env.XUNFEI_API_PASSWORD
  const originalXunfeiVoice = process.env.XUNFEI_TTS_VOICE
  const originalTencentSecretId = process.env.TENCENT_SECRET_ID
  const originalTencentSecretKey = process.env.TENCENT_SECRET_KEY

  afterEach(() => {
    process.env.TTS_PROVIDER = originalProvider
    process.env.XUNFEI_APP_ID = originalXunfeiAppId
    process.env.XUNFEI_API_KEY = originalXunfeiApiKey
    process.env.XUNFEI_API_SECRET = originalXunfeiApiSecret
    process.env.XUNFEI_API_PASSWORD = originalXunfeiApiPassword
    process.env.XUNFEI_TTS_VOICE = originalXunfeiVoice
    process.env.TENCENT_SECRET_ID = originalTencentSecretId
    process.env.TENCENT_SECRET_KEY = originalTencentSecretKey
  })

  function configureXunfei() {
    process.env.XUNFEI_APP_ID = 'app'
    process.env.XUNFEI_API_KEY = 'key'
    process.env.XUNFEI_API_SECRET = 'secret'
    process.env.XUNFEI_TTS_VOICE = 'x5_example_v3_voice'
  }

  it('uses configured non-mock provider when no stored preference exists', () => {
    configureXunfei()
    process.env.TTS_PROVIDER = 'xunfei'
    expect(resolveTTSProviderPreference()).toBe('xunfei')
  })

  it('uses configured non-mock provider over legacy default mock rows', () => {
    configureXunfei()
    process.env.TTS_PROVIDER = 'xunfei'
    expect(resolveTTSProviderPreference('mock')).toBe('xunfei')
  })

  it('keeps explicit non-mock stored preferences', () => {
    process.env.TTS_PROVIDER = 'xunfei'
    process.env.TENCENT_SECRET_ID = 'id'
    process.env.TENCENT_SECRET_KEY = 'key'
    expect(resolveTTSProviderPreference('tencent')).toBe('tencent')
  })

  it('keeps xunfei available when credentials exist and catalog voices can be selected', () => {
    process.env.TTS_PROVIDER = 'xunfei'
    process.env.XUNFEI_APP_ID = 'app'
    process.env.XUNFEI_API_KEY = 'key'
    process.env.XUNFEI_API_SECRET = 'secret'
    delete process.env.XUNFEI_TTS_VOICE
    expect(resolveTTSProviderPreference('xunfei')).toBe('xunfei')
  })

  it('keeps xunfei available with API password authentication', () => {
    process.env.TTS_PROVIDER = 'xunfei'
    process.env.XUNFEI_APP_ID = 'app'
    process.env.XUNFEI_API_PASSWORD = 'ak_password'
    delete process.env.XUNFEI_API_KEY
    delete process.env.XUNFEI_API_SECRET
    process.env.XUNFEI_TTS_VOICE = 'x5_example_v3_voice'

    expect(resolveTTSProviderPreference('xunfei')).toBe('xunfei')
  })

  it('falls back to mock when no provider is configured', () => {
    delete process.env.TTS_PROVIDER
    expect(resolveTTSProviderPreference('mock')).toBe('mock')
  })
})
