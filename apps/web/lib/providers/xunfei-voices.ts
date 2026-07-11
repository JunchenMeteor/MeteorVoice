/** ISO timestamp after which Xunfei trial voices expire and require a purchased V3 vcn. */
/** 讯飞试用语音过期时间，过期后需要购买 V3 正式音色。 */
export const XUNFEI_TRIAL_VOICE_EXPIRES_AT = process.env.XUNFEI_TRIAL_VOICE_EXPIRES_AT?.trim() || '2026-06-08T16:00:00.000Z'

/** Voice ID for the Catherine Professional News trial voice (American English female). */
/** 讯飞 Catherine 专业新闻播报试用语音 ID（美式英语女声）。 */
export const XUNFEI_TRIAL_VOICE_CATHERINE = 'x4_enus_catherine_profnews'

/** Voice ID for the Ryan Assistant trial voice (American English male). */
/** 讯飞 Ryan 助手试用语音 ID（美式英语男声）。 */
export const XUNFEI_TRIAL_VOICE_RYAN = 'x4_enus_ryan_assist'

/** Voice ID for the Lingxiaolu trial voice (Chinese female). */
/** 讯飞小露试用语音 ID（中文女声）。 */
export const XUNFEI_TRIAL_VOICE_LINGXIAOLU = 'x4_lingxiaolu_en'

/** Voice ID for the Yezi trial voice (Chinese female). */
/** 讯飞叶子试用语音 ID（中文女声）。 */
export const XUNFEI_TRIAL_VOICE_YEZI = 'x4_yezi'

/** Metadata for a single voice in the Xunfei voice catalog. */
/** 讯飞语音目录中单个语音的元数据。 */
export type XunfeiVoiceInfo = {
  id: string
  name: string
  language: 'en' | 'zh'
  gender: 'male' | 'female'
  tier: 'featured' | 'base'
  expiresAt?: string
}

/** Extended voice info including environment-variable key, usage label, and active/expired status. */
/** 扩展语音信息，包含环境变量键、用途标签和激活/过期状态。 */
export type XunfeiConfiguredVoiceInfo = XunfeiVoiceInfo & {
  envKey: string
  usage: string
  status: 'active' | 'expired'
}

type XunfeiVoiceEnv = Record<string, string | undefined>

/** Full catalog of known Xunfei TTS voices (trial and base tiers). */
/** 已知讯飞 TTS 语音的完整目录（试用和基础级别）。 */
export const xunfeiVoiceCatalog: XunfeiVoiceInfo[] = [
  {
    id: XUNFEI_TRIAL_VOICE_CATHERINE,
    name: 'Catherine Professional News',
    language: 'en',
    gender: 'female',
    tier: 'featured',
    expiresAt: XUNFEI_TRIAL_VOICE_EXPIRES_AT,
  },
  {
    id: XUNFEI_TRIAL_VOICE_RYAN,
    name: 'Ryan Assistant',
    language: 'en',
    gender: 'male',
    tier: 'featured',
    expiresAt: XUNFEI_TRIAL_VOICE_EXPIRES_AT,
  },
  {
    id: XUNFEI_TRIAL_VOICE_LINGXIAOLU,
    name: '讯飞小露',
    language: 'zh',
    gender: 'female',
    tier: 'featured',
    expiresAt: XUNFEI_TRIAL_VOICE_EXPIRES_AT,
  },
  {
    id: XUNFEI_TRIAL_VOICE_YEZI,
    name: '讯飞小露',
    language: 'zh',
    gender: 'female',
    tier: 'featured',
  },
  { id: 'x4_xiaoyan', name: '讯飞小燕', language: 'zh', gender: 'female', tier: 'base' },
  { id: 'aisjiuxu', name: '讯飞许久', language: 'zh', gender: 'male', tier: 'base' },
  { id: 'aisjinger', name: '讯飞小婧', language: 'zh', gender: 'female', tier: 'base' },
  { id: 'aisbabyxu', name: '讯飞许小宝', language: 'zh', gender: 'male', tier: 'base' },
]

const xunfeiVoiceById = new Map(xunfeiVoiceCatalog.map(voice => [voice.id, voice]))
const genderOrder = { male: 0, female: 1 } satisfies Record<XunfeiVoiceInfo['gender'], number>

function readEnvVoice(env: XunfeiVoiceEnv, key: keyof XunfeiVoiceEnv) {
  return env[key]?.trim() || undefined
}

function voiceInfoFor(id: string): XunfeiVoiceInfo {
  return xunfeiVoiceById.get(id) ?? {
    id,
    name: id,
    language: 'en',
    gender: 'female',
    tier: 'featured',
  }
}

function isExpiredTrialVoice(voice: string, nowMs: number) {
  const info = xunfeiVoiceById.get(voice)
  return Boolean(info?.expiresAt && nowMs >= Date.parse(info.expiresAt))
}

/**
 * Return the best available default Xunfei voice ID, preferring active English voices.
 * 返回最佳可用默认讯飞语音 ID，优先选择活跃的英语语音。
 */
export function getDefaultXunfeiVoiceId(nowMs = Date.now()) {
  const activeVoices = getSelectableXunfeiVoices(nowMs).filter(voice => voice.status === 'active')
  return activeVoices.find(voice => voice.language === 'en')?.id
    ?? activeVoices[0]?.id
    ?? null
}

/**
 * Return the default Xunfei voice ID for the requested language, falling back to any available voice.
 * 返回指定语言对应的默认讯飞语音 ID，不可用时回退到任意可用语音。
 */
export function getDefaultXunfeiVoiceIdForLanguage(language: 'en' | 'zh', nowMs = Date.now()) {
  const activeVoices = getSelectableXunfeiVoices(nowMs).filter(voice => voice.status === 'active')
  if (language === 'zh') {
    return activeVoices.find(voice => voice.id === XUNFEI_TRIAL_VOICE_YEZI)?.id
      ?? activeVoices.find(voice => voice.language === 'zh')?.id
      ?? activeVoices[0]?.id
      ?? null
  }
  return activeVoices.find(voice => voice.language === 'en')?.id
    ?? activeVoices[0]?.id
    ?? null
}

/**
 * Return all Xunfei voices sorted by gender, language, and name, each annotated with active/expired status.
 * 返回所有讯飞语音，按性别、语言和名称排序，并标注激活/过期状态。
 */
export function getSelectableXunfeiVoices(nowMs = Date.now()) {
  return [...xunfeiVoiceCatalog]
    .sort((left, right) =>
      genderOrder[left.gender] - genderOrder[right.gender] ||
      left.language.localeCompare(right.language) ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id))
    .map(voice => ({
      ...voice,
      status: isExpiredTrialVoice(voice.id, nowMs) ? 'expired' as const : 'active' as const,
    }))
}

/**
 * Return the voices currently configured via environment variables, with their active/expired status.
 * 返回通过环境变量配置的当前语音列表，及其激活/过期状态。
 */
export function getConfiguredXunfeiVoices(env: XunfeiVoiceEnv = process.env, nowMs = Date.now()): XunfeiConfiguredVoiceInfo[] {
  const configured = [
    { envKey: 'XUNFEI_TTS_VOICE', usage: 'Default', value: readEnvVoice(env, 'XUNFEI_TTS_VOICE') },
  ]

  return configured.flatMap(item => {
    if (!item.value) return []
    const info = voiceInfoFor(item.value)
    return [{
      ...info,
      envKey: item.envKey,
      usage: item.usage,
      status: isExpiredTrialVoice(item.value, nowMs) ? 'expired' : 'active',
    } satisfies XunfeiConfiguredVoiceInfo]
  })
}

/**
 * Check whether a valid, non-expired Xunfei voice configuration exists.
 * 检查是否存在有效且未过期的讯飞语音配置。
 */
export function hasXunfeiVoiceConfig(env: XunfeiVoiceEnv = process.env, nowMs = Date.now()) {
  try {
    resolveXunfeiVoiceForAccent('american', env, nowMs, getDefaultXunfeiVoiceId(nowMs) ?? undefined)
    return true
  } catch {
    return false
  }
}

/**
 * Resolve the Xunfei voice ID to use for a given accent, checking for explicit voice selection and trial expiry.
 * 根据口音解析要使用的讯飞语音 ID，检查显式语音选择和试用过期状态。
 */
export function resolveXunfeiVoiceForAccent(
  accent?: string,
  env: XunfeiVoiceEnv = process.env,
  nowMs = Date.now(),
  voiceId?: string | null,
) {
  if (voiceId?.trim()) {
    const voice = voiceId.trim()
    if (isExpiredTrialVoice(voice, nowMs)) {
      throw new Error(`Xunfei trial voice "${voice}" expired at ${XUNFEI_TRIAL_VOICE_EXPIRES_AT}. Configure a purchased V3-compatible vcn before using Xunfei TTS.`)
    }
    return voice
  }

  const fallback = readEnvVoice(env, 'XUNFEI_TTS_VOICE')
  const voice = fallback

  if (!voice) {
    throw new Error('XUNFEI_TTS_VOICE is required for Xunfei TTS when no coach voice is selected. Configure a default V3-compatible vcn from the Xunfei console, or select a voice from the Xunfei voice catalog.')
  }

  if (isExpiredTrialVoice(voice, nowMs)) {
    throw new Error(`Xunfei trial voice "${voice}" expired at ${XUNFEI_TRIAL_VOICE_EXPIRES_AT}. Configure a purchased V3-compatible vcn before using Xunfei TTS.`)
  }

  return voice
}

function containsChineseText(text: string) {
  return /[\u3400-\u9fff]/.test(text)
}

/**
 * Resolve the Xunfei voice ID for a given text payload, auto-selecting a Chinese voice when the text contains Chinese characters.
 * 根据文本内容解析讯飞语音 ID，当文本包含中文字符时自动选择中文语音。
 */
export function resolveXunfeiVoiceForText(
  text: string,
  accent?: string,
  env: XunfeiVoiceEnv = process.env,
  nowMs = Date.now(),
  voiceId?: string | null,
) {
  if (!containsChineseText(text)) {
    return resolveXunfeiVoiceForAccent(accent, env, nowMs, voiceId)
  }

  const selectedVoice = voiceId?.trim()
  if (selectedVoice) {
    if (isExpiredTrialVoice(selectedVoice, nowMs)) {
      throw new Error(`Xunfei trial voice "${selectedVoice}" expired at ${XUNFEI_TRIAL_VOICE_EXPIRES_AT}. Configure a purchased V3-compatible vcn before using Xunfei TTS.`)
    }
    const info = xunfeiVoiceById.get(selectedVoice)
    if (info?.language === 'zh') return selectedVoice
  }

  const chineseVoice = getDefaultXunfeiVoiceIdForLanguage('zh', nowMs)
  if (chineseVoice) return chineseVoice

  return resolveXunfeiVoiceForAccent(accent, env, nowMs, voiceId)
}
