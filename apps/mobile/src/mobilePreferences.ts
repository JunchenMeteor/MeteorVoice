import { createMeteorVoiceApiClient } from '@meteorvoice/api-client'
import type { VoiceProfile } from '@meteorvoice/shared'

export type XunfeiVoice = {
  id: string
  name: string
  language: 'en' | 'zh'
  gender: 'male' | 'female'
  tier: 'featured' | 'base'
  status: 'active' | 'expired'
  expiresAt?: string
}

type PrefInput = {
  apiBaseUrl: string
  getAuthHeaders: () => HeadersInit | Promise<HeadersInit>
  onUnauthorized?: () => void | Promise<void>
  ttsProvider?: string
  ttsSpeed?: number
  defaultScenarioKey?: string
  ttsVoiceId?: string | null
  selectedVoiceProfileId?: string | null
  uiTheme?: string
}

// 内存中记录同步失败的 key，下次成功 sync 时重试
const pendingSyncKeys = new Set<string>()

async function hasAuth(getAuthHeaders: () => HeadersInit | Promise<HeadersInit>) {
  const headers = await getAuthHeaders()
  return !!(headers as Record<string, string>).Authorization
}

export async function syncMobilePreferences(input: PrefInput) {
  if (!input.apiBaseUrl) return false

  const authed = await hasAuth(input.getAuthHeaders)
  if (!authed) return false

  const body: Record<string, unknown> = {}
  if (input.ttsProvider !== undefined) body.tts_provider = input.ttsProvider
  if (input.ttsSpeed !== undefined) body.tts_speed = input.ttsSpeed
  if (input.defaultScenarioKey !== undefined) body.default_scenario_key = input.defaultScenarioKey
  if (input.ttsVoiceId !== undefined) body.tts_voice_id = input.ttsVoiceId
  if (input.selectedVoiceProfileId !== undefined) body.selected_voice_profile_id = input.selectedVoiceProfileId
  if (input.uiTheme !== undefined) body.ui_theme = input.uiTheme

  if (Object.keys(body).length === 0) return false

  try {
    const api = createMeteorVoiceApiClient({
      baseUrl: input.apiBaseUrl,
      headers: input.getAuthHeaders,
      onUnauthorized: input.onUnauthorized,
    })
    await api.updatePreferences(body)
    // 成功后清除 pending
    pendingSyncKeys.clear()
    return true
  } catch {
    // 静默失败，记录待同步项（应用重启后下次 API 拉取会自动覆盖）
    for (const key of Object.keys(body)) {
      pendingSyncKeys.add(key)
    }
    return false
  }
}

export async function pullMobilePreferences(
  apiBaseUrl: string,
  getAuthHeaders: () => HeadersInit | Promise<HeadersInit>,
  onUnauthorized?: () => void | Promise<void>,
): Promise<{
  ttsProvider: string
  ttsSpeed: number
  defaultScenarioKey: string
  locale: string
  availableProviders: string[]
  ttsVoiceId: string | null
  voiceProfiles: VoiceProfile[]
  selectedVoiceProfileId: string | null
  xunfeiVoices: XunfeiVoice[]
  xunfeiVoiceCatalog: XunfeiVoice[]
  uiTheme: string
  uiThemeUpdatedAt: string
} | null> {
  if (!apiBaseUrl) return null

  const authed = await hasAuth(getAuthHeaders)
  if (!authed) return null

  try {
    const api = createMeteorVoiceApiClient({ baseUrl: apiBaseUrl, headers: getAuthHeaders, onUnauthorized })
    const raw = await api.getPreferences()
    pendingSyncKeys.clear()
    return {
      ttsProvider: raw.tts_provider ?? 'mock',
      ttsSpeed: raw.tts_speed ?? 1,
      defaultScenarioKey: raw.default_scenario_key ?? 'small-talk',
      locale: raw.locale ?? 'en',
      availableProviders: raw.available_providers ?? [],
      ttsVoiceId: raw.tts_voice_id ?? null,
      voiceProfiles: raw.voice_profiles ?? [],
      selectedVoiceProfileId: raw.selected_voice_profile_id ?? null,
      xunfeiVoices: raw.xunfei_voices?.configured ?? [],
      xunfeiVoiceCatalog: raw.xunfei_voices?.catalog ?? [],
      uiTheme: raw.ui_theme ?? 'forest',
      uiThemeUpdatedAt: raw.ui_theme_updated_at ?? new Date(0).toISOString(),
    }
  } catch {
    return null
  }
}

export function hasPendingMobileSyncs() {
  return pendingSyncKeys.size > 0
}
