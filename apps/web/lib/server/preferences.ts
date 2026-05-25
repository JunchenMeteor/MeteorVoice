import { createClient } from '@/lib/supabase/server'
import { getConfiguredXunfeiVoices, hasXunfeiVoiceConfig, xunfeiVoiceCatalog, type XunfeiConfiguredVoiceInfo, type XunfeiVoiceInfo } from '@/lib/providers/xunfei-voices'
import { accentProfiles, scenarios, type Locale } from '@meteorvoice/shared'

export type TTSProviderPreference = 'mock' | 'xunfei' | 'volcengine' | 'tencent'
export type ProductizedPreferences = {
  tts_provider: TTSProviderPreference
  available_providers: TTSProviderPreference[]
  xunfei_voices: {
    configured: XunfeiConfiguredVoiceInfo[]
    catalog: XunfeiVoiceInfo[]
  }
  locale: Locale
  default_scenario_key: string
  default_accent_key: string
  tts_speed: number
}

export function normalizeTTSProvider(value?: string | null): TTSProviderPreference {
  if (value === 'xunfei' || value === 'volcengine' || value === 'tencent') return value
  return 'mock'
}

export function resolveTTSProviderPreference(storedValue?: string | null) {
  const available = getAvailableProviders()
  const envFallback = normalizeTTSProvider(process.env.TTS_PROVIDER)
  const fallback = available.includes(envFallback) ? envFallback : 'mock'
  const stored = normalizeTTSProvider(storedValue)

  if (!storedValue) return fallback
  if (!available.includes(stored)) return fallback
  if (stored === 'mock' && fallback !== 'mock') return fallback
  return stored
}

export function getAvailableProviders(): TTSProviderPreference[] {
  const providers: TTSProviderPreference[] = ['mock']
  if (process.env.XUNFEI_APP_ID && process.env.XUNFEI_API_KEY && process.env.XUNFEI_API_SECRET && hasXunfeiVoiceConfig()) {
    providers.push('xunfei')
  }
  if (process.env.VOLCENGINE_TTS_APP_ID && process.env.VOLCENGINE_TTS_ACCESS_TOKEN) {
    providers.push('volcengine')
  }
  if (process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY) {
    providers.push('tencent')
  }
  return providers
}

function normalizeLocale(value?: string | null): Locale {
  return value === 'zh' ? 'zh' : 'en'
}

function normalizeScenarioKey(value?: string | null) {
  return scenarios.some(scenario => scenario.key === value) ? value as string : 'small-talk'
}

function normalizeAccentKey(value?: string | null) {
  return accentProfiles.some(accent => accent.key === value) ? value as string : 'american'
}

function normalizeTTSSpeed(value?: number | string | null) {
  const speed = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(speed)) return 1
  return Math.min(1.3, Math.max(0.7, Number(speed!.toFixed(2))))
}

export async function getPreferences(): Promise<ProductizedPreferences> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const availableProviders = getAvailableProviders()
  const xunfeiVoices = {
    configured: getConfiguredXunfeiVoices(),
    catalog: xunfeiVoiceCatalog,
  }
  if (!user) {
    return {
      tts_provider: resolveTTSProviderPreference(),
      available_providers: availableProviders,
      xunfei_voices: xunfeiVoices,
      locale: 'en',
      default_scenario_key: 'small-talk',
      default_accent_key: 'american',
      tts_speed: 1,
    }
  }

  const { data, error } = await supabase
    .from('theme_preferences')
    .select('tts_provider, locale, default_scenario_key, default_accent_key, tts_speed')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw error
  return {
    tts_provider: resolveTTSProviderPreference(data?.tts_provider),
    available_providers: availableProviders,
    xunfei_voices: xunfeiVoices,
    locale: normalizeLocale(data?.locale),
    default_scenario_key: normalizeScenarioKey(data?.default_scenario_key),
    default_accent_key: normalizeAccentKey(data?.default_accent_key),
    tts_speed: normalizeTTSSpeed(data?.tts_speed),
  }
}

export async function getTTSProviderPreference() {
  const preferences = await getPreferences()
  return preferences.tts_provider
}

export async function setPreferences(input: {
  tts_provider?: string
  locale?: string
  default_scenario_key?: string
  default_accent_key?: string
  tts_speed?: number
}) {
  const previous = await getPreferences()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Unauthorized')
  }

  const available = getAvailableProviders()
  const requestedProvider = normalizeTTSProvider(input.tts_provider ?? previous.tts_provider)
  const fallbackProvider = resolveTTSProviderPreference()
  const normalized = available.includes(requestedProvider) ? requestedProvider : fallbackProvider
  const locale = normalizeLocale(input.locale ?? previous.locale)
  const defaultScenarioKey = normalizeScenarioKey(input.default_scenario_key ?? previous.default_scenario_key)
  const defaultAccentKey = normalizeAccentKey(input.default_accent_key ?? previous.default_accent_key)
  const ttsSpeed = normalizeTTSSpeed(input.tts_speed ?? previous.tts_speed)
  const { error } = await supabase
    .from('theme_preferences')
    .upsert({
      user_id: user.id,
      tts_provider: normalized,
      locale,
      default_scenario_key: defaultScenarioKey,
      default_accent_key: defaultAccentKey,
      tts_speed: ttsSpeed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) throw error
  return {
    tts_provider: normalized,
    available_providers: available,
    xunfei_voices: {
      configured: getConfiguredXunfeiVoices(),
      catalog: xunfeiVoiceCatalog,
    },
    locale,
    default_scenario_key: defaultScenarioKey,
    default_accent_key: defaultAccentKey,
    tts_speed: ttsSpeed,
  } satisfies ProductizedPreferences
}

export async function setTTSProviderPreference(ttsProvider: string) {
  const next = await setPreferences({ tts_provider: ttsProvider })
  return next.tts_provider
}
