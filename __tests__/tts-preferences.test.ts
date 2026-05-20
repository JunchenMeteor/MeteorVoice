import { afterEach, describe, expect, it } from 'vitest'
import { resolveTTSProviderPreference } from '@/lib/server/preferences'

describe('resolveTTSProviderPreference', () => {
  const originalProvider = process.env.TTS_PROVIDER

  afterEach(() => {
    process.env.TTS_PROVIDER = originalProvider
  })

  it('uses configured non-mock provider when no stored preference exists', () => {
    process.env.TTS_PROVIDER = 'xunfei'
    expect(resolveTTSProviderPreference()).toBe('xunfei')
  })

  it('uses configured non-mock provider over legacy default mock rows', () => {
    process.env.TTS_PROVIDER = 'xunfei'
    expect(resolveTTSProviderPreference('mock')).toBe('xunfei')
  })

  it('keeps explicit non-mock stored preferences', () => {
    process.env.TTS_PROVIDER = 'xunfei'
    expect(resolveTTSProviderPreference('tencent')).toBe('tencent')
  })

  it('falls back to mock when no provider is configured', () => {
    delete process.env.TTS_PROVIDER
    expect(resolveTTSProviderPreference('mock')).toBe('mock')
  })
})
