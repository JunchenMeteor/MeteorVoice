/**
 * User preferences management. / 用户偏好管理。
 */
import type {
  Locale,
  VoiceProfile,
} from '@meteorvoice/shared'
import {
  normalizeLocale,
  scenarios,
} from '@meteorvoice/shared'

import type {
  XunfeiConfiguredVoiceInfo,
  XunfeiVoiceInfo,
} from '@/lib/providers/xunfei-voices'
import { getAzureVoiceProfiles } from '@/lib/providers/azure-voices'
import { createClient } from '@/lib/supabase/server'
import {
  getConfiguredXunfeiVoices,
  getDefaultXunfeiVoiceId,
  getSelectableXunfeiVoices,
  hasXunfeiVoiceConfig,
} from '@/lib/providers/xunfei-voices'

export type TTSProviderPreference = 'mock' | 'xunfei' | 'volcengine' | 'tencent' | 'azure'
export type ProductizedPreferences = {
  tts_provider: TTSProviderPreference
  available_providers: TTSProviderPreference[]
  xunfei_voices: {
    configured: XunfeiConfiguredVoiceInfo[]
    catalog: (XunfeiVoiceInfo & { status: 'active' | 'expired' })[]
  }
  tts_voice_id: string | null
  voice_profiles: VoiceProfile[]
  selected_voice_profile_id: string | null
  locale: Locale
  default_scenario_key: string
  tts_speed: number
  ui_theme: string
  ui_theme_updated_at: string
}

type ProductPreferenceRow = {
  tts_provider?: string | null
  locale?: string | null
  default_scenario_key?: string | null
  tts_speed?: number | string | null
  tts_voice_id?: string | null
  selected_voice_profile_id?: string | null
} | null

type ThemePreferenceRow = {
  ui_theme?: string | null
  ui_theme_updated_at?: string | null
} | null

type PreferenceRow = ProductPreferenceRow & ThemePreferenceRow

type VoiceProfileRow = {
  id: string
  provider: string
  provider_voice_id: string | null
  display_name: string
  display_name_zh: string | null
  description: string | null
  description_zh: string | null
  locale: string
  accent_key: string
  accent_label: string | null
  accent_region: string | null
  gender: string | null
  style: string | null
  quality_tier: string | null
  status: string
  expires_at: string | null
  sort_order: number | null
}

export function normalizeTTSProvider(value?: string | null): TTSProviderPreference {
  if (value === 'xunfei' || value === 'volcengine' || value === 'tencent' || value === 'azure') return value
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
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) {
    providers.push('azure')
  }
  return providers
}

function normalizeScenarioKey(value?: string | null) {
  return scenarios.some(scenario => scenario.key === value) ? value as string : 'small-talk'
}

function normalizeTTSSpeed(value?: number | string | null) {
  const speed = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(speed)) return 1
  return Math.min(1.3, Math.max(0.7, Number(speed!.toFixed(2))))
}

function fallbackVoiceProfiles(availableProviders = getAvailableProviders()) {
  const xunfeiAvailable = availableProviders.includes('xunfei')
  const xunfeiProfiles: VoiceProfile[] = getSelectableXunfeiVoices().map(voice => ({
    id: `xunfei:${voice.id}`,
    provider: 'xunfei',
    providerVoiceId: voice.id,
    displayName: voice.name,
    locale: voice.language,
    accentKey: 'american',
    gender: voice.gender,
    qualityTier: voice.tier,
    expiresAt: voice.expiresAt,
    status: xunfeiAvailable ? voice.status : 'unavailable',
  }))

  const mockProfiles: VoiceProfile[] = [{
    id: 'mock:browser',
    provider: 'mock',
    providerVoiceId: null,
    displayName: 'Browser voice',
    locale: 'en',
    accentKey: 'american',
    status: 'active',
  }]

  return [
    ...mockProfiles,
    ...xunfeiProfiles,
    ...getAzureVoiceProfiles(availableProviders.includes('azure')),
  ]
}

function normalizeVoiceProfile(row: VoiceProfileRow, availableProviders: TTSProviderPreference[]): VoiceProfile | null {
  const provider = normalizeTTSProvider(row.provider)
  if (provider !== row.provider) return null
  const configured = provider === 'mock' || availableProviders.includes(provider)
  const configuredStatus = row.status === 'active' || row.status === 'expired' || row.status === 'unavailable'
    ? row.status
    : 'unavailable'
  const expiresAt = row.expires_at ?? undefined
  const expired = expiresAt ? Date.now() >= Date.parse(expiresAt) : false
  return {
    id: row.id,
    provider,
    providerVoiceId: row.provider_voice_id,
    displayName: row.display_name,
    displayNameZh: row.display_name_zh ?? undefined,
    description: row.description ?? undefined,
    descriptionZh: row.description_zh ?? undefined,
    locale: row.locale === 'zh' ? 'zh' : 'en',
    accentKey: row.accent_key || 'american',
    accentLabel: row.accent_label ?? undefined,
    accentRegion: row.accent_region ?? undefined,
    gender: row.gender === 'male' || row.gender === 'female' ? row.gender : undefined,
    style: row.style ?? undefined,
    qualityTier: row.quality_tier === 'base' || row.quality_tier === 'featured' ? row.quality_tier : undefined,
    expiresAt,
    status: configured ? (expired ? 'expired' : configuredStatus) : 'unavailable',
  }
}

async function getVoiceProfiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  availableProviders = getAvailableProviders(),
) {
  const { data, error } = await supabase
    .from('tts_voice_profiles')
    .select('id, provider, provider_voice_id, display_name, display_name_zh, description, description_zh, locale, accent_key, accent_label, accent_region, gender, style, quality_tier, status, expires_at, sort_order')
    .order('sort_order', { ascending: true })

  if (error || !data?.length) {
    return fallbackVoiceProfiles(availableProviders)
  }

  return (data as VoiceProfileRow[])
    .map(row => normalizeVoiceProfile(row, availableProviders))
    .filter((profile): profile is VoiceProfile => Boolean(profile))
}

function defaultVoiceProfileForProvider(provider: TTSProviderPreference, profiles: VoiceProfile[]) {
  return profiles.find(profile => profile.provider === provider && profile.status === 'active') ?? null
}

function resolveVoiceProfile(input: {
  selectedVoiceProfileId?: string | null
  provider: TTSProviderPreference
  voiceId?: string | null
  profiles: VoiceProfile[]
}) {
  const direct = profileFromId(input.selectedVoiceProfileId, input.profiles)
  if (direct) return direct
  const byProviderVoice = input.voiceId
    ? input.profiles.find(profile =>
      profile.provider === input.provider &&
      profile.providerVoiceId === input.voiceId &&
      profile.status === 'active')
    : null
  return byProviderVoice ?? defaultVoiceProfileForProvider(input.provider, input.profiles)
}

function normalizeTTSVoiceId(value: string | null | undefined, provider: TTSProviderPreference) {
  const voiceId = value?.trim()
  if (provider === 'xunfei') {
    if (!voiceId) return getDefaultXunfeiVoiceId()
    const voice = getSelectableXunfeiVoices().find(item => item.id === voiceId)
    if (voice?.status === 'expired') return getDefaultXunfeiVoiceId()
    return voiceId
  }
  if (provider === 'azure') {
    const profiles = getAzureVoiceProfiles(true)
    if (voiceId && profiles.some(profile => profile.providerVoiceId === voiceId)) return voiceId
    return profiles[0]?.providerVoiceId ?? null
  }
  return null
}

function profileFromId(profileId: string | null | undefined, profiles: VoiceProfile[]) {
  if (!profileId) return null
  return profiles.find(profile => profile.id === profileId && profile.status === 'active') ?? null
}

function isMissingColumnError(error: unknown, column: string) {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === '42703' &&
    JSON.stringify(error).includes(column),
  )
}

function isMissingRelationError(error: unknown, relation: string) {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    ((error as { code?: string }).code === '42P01' || (error as { code?: string }).code === 'PGRST205') &&
    JSON.stringify(error).includes(relation),
  )
}

function combinePreferenceRows(product: ProductPreferenceRow, theme: ThemePreferenceRow): PreferenceRow {
  return {
    ...(product ?? {}),
    ...(theme ?? {}),
  }
}

export async function getPreferences(): Promise<ProductizedPreferences> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const availableProviders = getAvailableProviders()
  const xunfeiVoices = {
    configured: getConfiguredXunfeiVoices(),
    catalog: getSelectableXunfeiVoices(),
  }
  const voiceProfiles = await getVoiceProfiles(supabase, availableProviders)
  if (!user) {
    const provider = resolveTTSProviderPreference()
    const selectedProfile = defaultVoiceProfileForProvider(provider, voiceProfiles)
    const ttsVoiceId = selectedProfile ? normalizeTTSVoiceId(selectedProfile.providerVoiceId, selectedProfile.provider) : null
    return {
      tts_provider: provider,
      available_providers: availableProviders,
      xunfei_voices: xunfeiVoices,
      tts_voice_id: ttsVoiceId,
      voice_profiles: voiceProfiles,
      selected_voice_profile_id: selectedProfile?.id ?? null,
      locale: 'en',
      default_scenario_key: 'small-talk',
      tts_speed: 1,
      ui_theme: 'forest',
      ui_theme_updated_at: new Date(0).toISOString(),
    }
  }

  let data: PreferenceRow = null
  const productResult = await supabase
    .from('user_preferences')
    .select('tts_provider, locale, default_scenario_key, tts_speed, tts_voice_id, selected_voice_profile_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (productResult.error && isMissingRelationError(productResult.error, 'user_preferences')) {
    let legacy = await supabase
      .from('theme_preferences')
      .select('tts_provider, locale, default_scenario_key, tts_speed, tts_voice_id, selected_voice_profile_id, ui_theme, ui_theme_updated_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (legacy.error && (isMissingColumnError(legacy.error, 'tts_voice_id') || isMissingColumnError(legacy.error, 'selected_voice_profile_id'))) {
      legacy = await supabase
        .from('theme_preferences')
        .select('tts_provider, locale, default_scenario_key, tts_speed')
        .eq('user_id', user.id)
        .maybeSingle()
    }

    if (legacy.error) throw legacy.error
    data = legacy.data as PreferenceRow
  } else {
    if (productResult.error) throw productResult.error
    const themeResult = await supabase
      .from('theme_preferences')
      .select('ui_theme, ui_theme_updated_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (themeResult.error && !isMissingColumnError(themeResult.error, 'ui_theme')) throw themeResult.error
    data = combinePreferenceRows(productResult.data as ProductPreferenceRow, themeResult.data as ThemePreferenceRow)
  }

  const provider = resolveTTSProviderPreference(data?.tts_provider)
  const selectedProfile = resolveVoiceProfile({
    selectedVoiceProfileId: data?.selected_voice_profile_id,
    provider,
    voiceId: data?.tts_voice_id,
    profiles: voiceProfiles,
  })
  const ttsVoiceId = selectedProfile ? normalizeTTSVoiceId(selectedProfile.providerVoiceId, selectedProfile.provider) : null
  return {
    tts_provider: selectedProfile?.provider ?? provider,
    available_providers: availableProviders,
    xunfei_voices: xunfeiVoices,
    tts_voice_id: ttsVoiceId,
    voice_profiles: voiceProfiles,
    selected_voice_profile_id: selectedProfile?.id ?? null,
    locale: normalizeLocale(data?.locale),
    default_scenario_key: normalizeScenarioKey(data?.default_scenario_key),
    tts_speed: normalizeTTSSpeed(data?.tts_speed),
    ui_theme: data?.ui_theme ?? 'forest',
    ui_theme_updated_at: data?.ui_theme_updated_at ?? new Date(0).toISOString(),
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
  tts_speed?: number
  tts_voice_id?: string | null
  selected_voice_profile_id?: string | null
  ui_theme?: string
}) {
  const previous = await getPreferences()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Unauthorized')
  }

  const available = getAvailableProviders()
  const voiceProfiles = await getVoiceProfiles(supabase, available)
  const selectedProfile = profileFromId(input.selected_voice_profile_id, voiceProfiles)
  const requestedProvider = normalizeTTSProvider(input.tts_provider ?? previous.tts_provider)
  const fallbackProvider = resolveTTSProviderPreference()
  const provider = selectedProfile?.provider ?? (available.includes(requestedProvider) ? requestedProvider : fallbackProvider)
  const providerChanged = input.tts_provider !== undefined && input.tts_provider !== previous.tts_provider
  const activeProfile = selectedProfile
    ?? (providerChanged ? defaultVoiceProfileForProvider(provider, voiceProfiles) : resolveVoiceProfile({
      selectedVoiceProfileId: previous.selected_voice_profile_id,
      provider,
      voiceId: input.tts_voice_id ?? previous.tts_voice_id,
      profiles: voiceProfiles,
    }))
  const normalized = activeProfile?.provider ?? provider
  const locale = normalizeLocale(input.locale ?? previous.locale)
  const defaultScenarioKey = normalizeScenarioKey(input.default_scenario_key ?? previous.default_scenario_key)
  const ttsSpeed = normalizeTTSSpeed(input.tts_speed ?? previous.tts_speed)
  const ttsVoiceId = activeProfile
    ? normalizeTTSVoiceId(activeProfile.providerVoiceId, normalized)
    : null
  const selectedVoiceProfileId = activeProfile?.id ?? null
  const uiTheme = input.ui_theme ?? previous.ui_theme
  const uiThemeUpdatedAt = input.ui_theme !== undefined ? new Date().toISOString() : previous.ui_theme_updated_at
  const updatedAt = new Date().toISOString()
  const productResult = await supabase
    .from('user_preferences')
    .upsert({
      user_id: user.id,
      tts_provider: normalized,
      locale,
      default_scenario_key: defaultScenarioKey,
      tts_speed: ttsSpeed,
      tts_voice_id: ttsVoiceId,
      selected_voice_profile_id: selectedVoiceProfileId,
      updated_at: updatedAt,
    }, { onConflict: 'user_id' })
  let error: unknown = productResult.error

  if (error && isMissingRelationError(error, 'user_preferences')) {
    const legacy = await supabase
      .from('theme_preferences')
      .upsert({
        user_id: user.id,
        tts_provider: normalized,
        locale,
        default_scenario_key: defaultScenarioKey,
        tts_speed: ttsSpeed,
        tts_voice_id: ttsVoiceId,
        selected_voice_profile_id: selectedVoiceProfileId,
        ui_theme: uiTheme,
        ui_theme_updated_at: uiThemeUpdatedAt,
        updated_at: updatedAt,
      }, { onConflict: 'user_id' })
    error = legacy.error

    if (error && (isMissingColumnError(error, 'tts_voice_id') || isMissingColumnError(error, 'selected_voice_profile_id'))) {
      const fallback = await supabase
        .from('theme_preferences')
        .upsert({
          user_id: user.id,
          tts_provider: normalized,
          locale,
          default_scenario_key: defaultScenarioKey,
          tts_speed: ttsSpeed,
          updated_at: updatedAt,
        }, { onConflict: 'user_id' })
      error = fallback.error
    }
  }

  if (error) throw error

  if (input.ui_theme !== undefined) {
    const { error: themeError } = await supabase
      .from('theme_preferences')
      .upsert({
        user_id: user.id,
        ui_theme: uiTheme,
        ui_theme_updated_at: uiThemeUpdatedAt,
        updated_at: updatedAt,
      }, { onConflict: 'user_id' })
    if (themeError) throw themeError
  }

  return {
    tts_provider: normalized,
    available_providers: available,
    xunfei_voices: {
      configured: getConfiguredXunfeiVoices(),
      catalog: getSelectableXunfeiVoices(),
    },
    tts_voice_id: ttsVoiceId,
    voice_profiles: voiceProfiles,
    selected_voice_profile_id: selectedVoiceProfileId,
    locale,
    default_scenario_key: defaultScenarioKey,
    tts_speed: ttsSpeed,
    ui_theme: uiTheme,
    ui_theme_updated_at: uiThemeUpdatedAt,
  } satisfies ProductizedPreferences
}

export async function setTTSProviderPreference(ttsProvider: string) {
  const next = await setPreferences({ tts_provider: ttsProvider })
  return next.tts_provider
}
