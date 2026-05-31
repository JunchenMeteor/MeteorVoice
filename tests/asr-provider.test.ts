import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  asrProviderCapabilities,
  createASRProviderDescriptor,
  normalizeASRProviderKey,
  normalizeASRSessionConfig,
} from '@meteorvoice/shared'
import { createASRSessionFromRequest, getASRProviders, getDefaultASRProvider } from '@/lib/server/asr'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
  vi.unstubAllGlobals()
})

describe('ASR provider contracts', () => {
  it('normalizes unknown provider input to native', () => {
    expect(normalizeASRProviderKey('xunfei')).toBe('xunfei')
    expect(normalizeASRProviderKey('unknown')).toBe('native')
  })

  it('publishes expected capabilities for all planned providers', () => {
    expect(Object.keys(asrProviderCapabilities)).toEqual(['native', 'xunfei', 'azure', 'tencent', 'volcengine'])
    expect(asrProviderCapabilities.xunfei.modes).toContain('streaming')
    expect(asrProviderCapabilities.azure.languageModes).toContain('auto')
    expect(asrProviderCapabilities.native.supportsServerBootstrap).toBe(false)
  })

  it('creates safe public descriptors without secrets', () => {
    const descriptor = createASRProviderDescriptor('xunfei', {
      configured: false,
      enabled: false,
      disabledReason: 'Missing XUNFEI_ASR_APP_ID',
    })

    expect(descriptor.key).toBe('xunfei')
    expect(descriptor.enabled).toBe(false)
    expect(JSON.stringify(descriptor)).not.toContain('secret')
  })

  it('normalizes session config against provider capability', () => {
    const config = normalizeASRSessionConfig({
      provider: 'xunfei',
      mode: 'streaming',
      languageMode: 'auto',
      endpointSilenceMs: -1,
    })

    expect(config.mode).toBe('streaming')
    expect(config.languageMode).toBe('mixed_zh_en')
    expect(config.endpointSilenceMs).toBe(900)
    expect(config.enableInterimResults).toBe(true)
  })
})

describe('ASR server registry', () => {
  it('always exposes native and marks remote providers disabled until configured', () => {
    delete process.env.ASR_PROVIDER
    delete process.env.XUNFEI_ASR_APP_ID
    delete process.env.XUNFEI_ASR_API_KEY
    delete process.env.XUNFEI_ASR_API_SECRET

    const providers = getASRProviders()
    expect(providers.find(provider => provider.key === 'native')).toMatchObject({ enabled: true, configured: true })
    expect(providers.find(provider => provider.key === 'xunfei')).toMatchObject({ enabled: false, configured: false })
    expect(getDefaultASRProvider()).toBe('native')
  })

  it('creates configured Xunfei bootstrap without returning raw API secrets', async () => {
    process.env.ASR_PROVIDER = 'xunfei'
    process.env.XUNFEI_ASR_APP_ID = 'app-id'
    process.env.XUNFEI_ASR_API_KEY = 'api-key'
    process.env.XUNFEI_ASR_API_SECRET = 'api-secret'
    process.env.XUNFEI_ASR_PRODUCT = 'zh_iat'

    expect(getDefaultASRProvider()).toBe('xunfei')
    const result = await createASRSessionFromRequest({ provider: 'xunfei', mode: 'streaming', endpointSilenceMs: 1200 })

    expect(result).toMatchObject({
      provider: 'xunfei',
      status: 'created',
      transport: 'websocket',
      providerConfig: {
        appId: 'app-id',
        domain: 'slm',
        language: 'zh_cn',
        accent: 'mandarin',
        eosMs: 1200,
        frameIntervalMs: 40,
        frameSizeBytes: 1280,
      },
    })
    expect(JSON.stringify(result)).not.toContain('api-secret')
  })

  it('returns native unsupported bootstrap so mobile keeps using local STT for now', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'fixed-id' })

    await expect(createASRSessionFromRequest({ provider: 'native' })).resolves.toMatchObject({
      provider: 'native',
      status: 'unsupported',
      sessionId: 'asr_native_fixed-id',
      transport: 'native',
      config: {
        provider: 'native',
        mode: 'single_utterance',
        languageMode: 'auto',
        sessionId: 'asr_native_fixed-id',
      },
    })
  })
})
