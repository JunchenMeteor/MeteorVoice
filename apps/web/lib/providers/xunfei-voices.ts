export const XUNFEI_TRIAL_VOICE_EXPIRES_AT = '2026-06-08T16:00:00.000Z'
export const XUNFEI_TRIAL_VOICE_CATHERINE = 'x4_enus_catherine_profnews'
export const XUNFEI_TRIAL_VOICE_RYAN = 'x4_enus_ryan_assist'
export const XUNFEI_TRIAL_VOICE_LINGXIAOLU = 'x4_lingxiaolu_en'
export const XUNFEI_TRIAL_VOICE_YEZI = 'x4_yezi'

export type XunfeiVoiceInfo = {
  id: string
  name: string
  language: 'en' | 'zh'
  gender: 'male' | 'female'
  tier: 'featured' | 'base'
  expiresAt?: string
}

export type XunfeiConfiguredVoiceInfo = XunfeiVoiceInfo & {
  envKey: string
  usage: string
  status: 'active' | 'expired'
}

type XunfeiVoiceEnv = Record<string, string | undefined>

export const xunfeiVoiceCatalog: XunfeiVoiceInfo[] = [
  {
    id: XUNFEI_TRIAL_VOICE_CATHERINE,
    name: 'Catherine Professional News',
    language: 'en',
    gender: 'male',
    tier: 'featured',
    expiresAt: XUNFEI_TRIAL_VOICE_EXPIRES_AT,
  },
  {
    id: XUNFEI_TRIAL_VOICE_RYAN,
    name: 'Ryan Assistant',
    language: 'en',
    gender: 'female',
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

export function getDefaultXunfeiVoiceId(nowMs = Date.now()) {
  const activeVoices = getSelectableXunfeiVoices(nowMs).filter(voice => voice.status === 'active')
  return activeVoices.find(voice => voice.language === 'en')?.id
    ?? activeVoices[0]?.id
    ?? null
}

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

export function hasXunfeiVoiceConfig(env: XunfeiVoiceEnv = process.env, nowMs = Date.now()) {
  try {
    resolveXunfeiVoiceForAccent('american', env, nowMs, getDefaultXunfeiVoiceId(nowMs) ?? undefined)
    return true
  } catch {
    return false
  }
}

export function resolveXunfeiVoiceForAccent(
  accent?: string,
  env: XunfeiVoiceEnv = process.env,
  nowMs = Date.now(),
  voiceId?: string | null,
) {
  if (voiceId?.trim()) {
    const voice = voiceId.trim()
    if (isExpiredTrialVoice(voice, nowMs)) {
      throw new Error(`Xunfei trial voice "${voice}" expired at 2026-06-09 00:00 Asia/Shanghai. Configure a purchased V3-compatible vcn before using Xunfei TTS.`)
    }
    return voice
  }

  const fallback = readEnvVoice(env, 'XUNFEI_TTS_VOICE')
  const voice = fallback

  if (!voice) {
    throw new Error('XUNFEI_TTS_VOICE is required for Xunfei TTS when no coach voice is selected. Configure a default V3-compatible vcn from the Xunfei console, or select a voice from the Xunfei voice catalog.')
  }

  if (isExpiredTrialVoice(voice, nowMs)) {
    throw new Error(`Xunfei trial voice "${voice}" expired at 2026-06-09 00:00 Asia/Shanghai. Configure a purchased V3-compatible vcn before using Xunfei TTS.`)
  }

  return voice
}
