export type ASRProviderKey = 'native' | 'xunfei' | 'azure' | 'tencent' | 'volcengine'

export type ASRMode = 'single_utterance' | 'streaming' | 'file'

export type ASRLanguageMode = 'english' | 'mandarin' | 'mixed_zh_en' | 'auto'

export type ASRSessionStatus = 'created' | 'unsupported' | 'provider_not_configured'

export type ASRTransport = 'native' | 'websocket' | 'http'

export type ASRProviderCapability = {
  modes: ASRMode[]
  languageModes: ASRLanguageMode[]
  transports: ASRTransport[]
  supportsPunctuation: boolean
  supportsInterimResults: boolean
  supportsEndpointing: boolean
  supportsNoiseReduction: boolean
  supportsServerBootstrap: boolean
  recommendedForMobile: boolean
}

export type ASRProviderDescriptor = {
  key: ASRProviderKey
  label: string
  configured: boolean
  enabled: boolean
  capability: ASRProviderCapability
  disabledReason?: string
}

export type ASRSessionConfig = {
  provider: ASRProviderKey
  mode: ASRMode
  languageMode: ASRLanguageMode
  locale?: string
  scenarioKey?: string
  sessionId?: string
  userId?: string
  enableInterimResults?: boolean
  enablePunctuation?: boolean
  endpointSilenceMs?: number
  maxDurationMs?: number
  clientTraceId?: string
}

export type ASRSessionBootstrapRequest = Partial<ASRSessionConfig> & {
  provider: ASRProviderKey
}

export type ASRSessionBootstrapResponse = {
  provider: ASRProviderKey
  status: ASRSessionStatus
  sessionId: string
  transport: ASRTransport
  expiresAt?: string
  endpointUrl?: string
  headers?: Record<string, string>
  query?: Record<string, string>
  config: ASRSessionConfig
}

export type ASRTranscriptEventType = 'speech_start' | 'partial' | 'final' | 'speech_end' | 'error'

export type ASRTranscriptEvent = {
  type: ASRTranscriptEventType
  provider: ASRProviderKey
  sessionId: string
  transcript?: string
  isFinal: boolean
  confidence?: number
  elapsedMs?: number
  language?: string
  error?: string
}

export const asrProviderCapabilities: Record<ASRProviderKey, ASRProviderCapability> = {
  native: {
    modes: ['single_utterance'],
    languageModes: ['english', 'mandarin', 'mixed_zh_en', 'auto'],
    transports: ['native'],
    supportsPunctuation: true,
    supportsInterimResults: true,
    supportsEndpointing: false,
    supportsNoiseReduction: false,
    supportsServerBootstrap: false,
    recommendedForMobile: true,
  },
  xunfei: {
    modes: ['single_utterance', 'streaming', 'file'],
    languageModes: ['english', 'mandarin', 'mixed_zh_en'],
    transports: ['websocket', 'http'],
    supportsPunctuation: true,
    supportsInterimResults: true,
    supportsEndpointing: true,
    supportsNoiseReduction: true,
    supportsServerBootstrap: true,
    recommendedForMobile: true,
  },
  azure: {
    modes: ['single_utterance', 'streaming', 'file'],
    languageModes: ['english', 'mandarin', 'mixed_zh_en', 'auto'],
    transports: ['websocket', 'http'],
    supportsPunctuation: true,
    supportsInterimResults: true,
    supportsEndpointing: true,
    supportsNoiseReduction: true,
    supportsServerBootstrap: true,
    recommendedForMobile: true,
  },
  tencent: {
    modes: ['single_utterance', 'streaming', 'file'],
    languageModes: ['english', 'mandarin', 'mixed_zh_en'],
    transports: ['websocket', 'http'],
    supportsPunctuation: true,
    supportsInterimResults: true,
    supportsEndpointing: true,
    supportsNoiseReduction: true,
    supportsServerBootstrap: true,
    recommendedForMobile: true,
  },
  volcengine: {
    modes: ['single_utterance', 'streaming', 'file'],
    languageModes: ['english', 'mandarin', 'mixed_zh_en'],
    transports: ['websocket', 'http'],
    supportsPunctuation: true,
    supportsInterimResults: true,
    supportsEndpointing: true,
    supportsNoiseReduction: true,
    supportsServerBootstrap: true,
    recommendedForMobile: true,
  },
}

export const asrProviderLabels: Record<ASRProviderKey, string> = {
  native: 'Device speech recognition',
  xunfei: 'iFLYTEK ASR',
  azure: 'Azure Speech to Text',
  tencent: 'Tencent Cloud ASR',
  volcengine: 'Volcengine ASR',
}

export const asrProviderKeys = Object.keys(asrProviderCapabilities) as ASRProviderKey[]

export function isASRProviderKey(value: unknown): value is ASRProviderKey {
  return typeof value === 'string' && asrProviderKeys.includes(value as ASRProviderKey)
}

export function normalizeASRProviderKey(value: unknown, fallback: ASRProviderKey = 'native'): ASRProviderKey {
  return isASRProviderKey(value) ? value : fallback
}

export function createASRProviderDescriptor(
  key: ASRProviderKey,
  options: {
    configured?: boolean
    enabled?: boolean
    disabledReason?: string
  } = {},
): ASRProviderDescriptor {
  const configured = options.configured ?? key === 'native'
  const enabled = options.enabled ?? configured
  return {
    key,
    label: asrProviderLabels[key],
    configured,
    enabled,
    capability: asrProviderCapabilities[key],
    disabledReason: enabled ? undefined : options.disabledReason ?? 'Provider is not configured',
  }
}

export function normalizeASRSessionConfig(input: ASRSessionBootstrapRequest): ASRSessionConfig {
  const provider = normalizeASRProviderKey(input.provider)
  const capability = asrProviderCapabilities[provider]
  const mode = capability.modes.includes(input.mode as ASRMode) ? input.mode as ASRMode : capability.modes[0]
  const languageMode = capability.languageModes.includes(input.languageMode as ASRLanguageMode)
    ? input.languageMode as ASRLanguageMode
    : defaultLanguageMode(provider)

  return {
    provider,
    mode,
    languageMode,
    locale: input.locale,
    scenarioKey: input.scenarioKey,
    sessionId: input.sessionId,
    userId: input.userId,
    enableInterimResults: input.enableInterimResults ?? capability.supportsInterimResults,
    enablePunctuation: input.enablePunctuation ?? capability.supportsPunctuation,
    endpointSilenceMs: normalizePositiveInteger(input.endpointSilenceMs, 900),
    maxDurationMs: normalizePositiveInteger(input.maxDurationMs, 60000),
    clientTraceId: input.clientTraceId,
  }
}

function defaultLanguageMode(provider: ASRProviderKey): ASRLanguageMode {
  return provider === 'native' || provider === 'azure' ? 'auto' : 'mixed_zh_en'
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback
}
