import {
  asrProviderKeys,
  createASRProviderDescriptor,
  normalizeASRProviderKey,
  normalizeASRSessionConfig,
  type ASRProviderDescriptor,
  type ASRProviderKey,
  type ASRSessionBootstrapRequest,
  type ASRSessionBootstrapResponse,
} from '@meteorvoice/shared'

const serverBootstrapPendingMessage = 'ASR server bootstrap is not implemented for this provider yet'

export function getASRProviders(): ASRProviderDescriptor[] {
  return asrProviderKeys.map(key => {
    const configured = isASRProviderConfigured(key)
    const enabled = key === 'native' || configured
    return createASRProviderDescriptor(key, {
      configured,
      enabled,
      disabledReason: enabled ? undefined : missingConfigurationReason(key),
    })
  })
}

export function getDefaultASRProvider(): ASRProviderKey {
  const configuredDefault = normalizeASRProviderKey(process.env.ASR_PROVIDER, 'native')
  const provider = getASRProviders().find(item => item.key === configuredDefault)
  return provider?.enabled ? provider.key : 'native'
}

export function createASRSessionFromRequest(input: ASRSessionBootstrapRequest) {
  const provider = normalizeASRProviderKey(input.provider, getDefaultASRProvider())
  const descriptor = getASRProviders().find(item => item.key === provider)

  if (!descriptor?.enabled) {
    return {
      error: descriptor?.disabledReason ?? 'ASR provider is not configured',
      status: 400 as const,
    }
  }

  const config = normalizeASRSessionConfig({ ...input, provider })
  const sessionId = config.sessionId ?? createASRSessionId(provider)

  if (provider === 'native') {
    return {
      provider,
      status: 'unsupported',
      sessionId,
      transport: 'native',
      config: { ...config, sessionId },
    } satisfies ASRSessionBootstrapResponse
  }

  return {
    error: serverBootstrapPendingMessage,
    status: 501 as const,
  }
}

function isASRProviderConfigured(provider: ASRProviderKey) {
  if (provider === 'native') return true
  if (provider === 'xunfei') {
    return Boolean(process.env.XUNFEI_ASR_APP_ID && process.env.XUNFEI_ASR_API_KEY && process.env.XUNFEI_ASR_API_SECRET)
  }
  if (provider === 'azure') {
    return Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION)
  }
  if (provider === 'tencent') {
    return Boolean(process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY)
  }
  if (provider === 'volcengine') {
    return Boolean(process.env.VOLCENGINE_ASR_APP_ID && process.env.VOLCENGINE_ASR_ACCESS_TOKEN)
  }
  return false
}

function missingConfigurationReason(provider: ASRProviderKey) {
  if (provider === 'native') return undefined
  return `Missing ${requiredEnvNames(provider).join(', ')}`
}

function requiredEnvNames(provider: ASRProviderKey) {
  if (provider === 'xunfei') return ['XUNFEI_ASR_APP_ID', 'XUNFEI_ASR_API_KEY', 'XUNFEI_ASR_API_SECRET']
  if (provider === 'azure') return ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION']
  if (provider === 'tencent') return ['TENCENT_SECRET_ID', 'TENCENT_SECRET_KEY']
  if (provider === 'volcengine') return ['VOLCENGINE_ASR_APP_ID', 'VOLCENGINE_ASR_ACCESS_TOKEN']
  return []
}

function createASRSessionId(provider: ASRProviderKey) {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `asr_${provider}_${random}`
}
