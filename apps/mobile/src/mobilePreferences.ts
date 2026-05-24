import { createMeteorVoiceApiClient } from '@meteorvoice/api-client'

type PrefInput = {
  apiBaseUrl: string
  getAuthHeaders: () => HeadersInit
  ttsProvider?: string
  ttsSpeed?: number
  defaultScenarioKey?: string
  defaultAccentKey?: string
}

// 内存中记录同步失败的 key，下次成功 sync 时重试
const pendingSyncKeys = new Set<string>()

async function hasAuth(getAuthHeaders: () => HeadersInit) {
  const headers = await getAuthHeaders()
  return !!(headers as Record<string, string>).Authorization
}

export async function syncMobilePreferences(input: PrefInput) {
  if (!input.apiBaseUrl) return

  const authed = await hasAuth(input.getAuthHeaders)
  if (!authed) return

  const body: Record<string, unknown> = {}
  if (input.ttsProvider !== undefined) body.tts_provider = input.ttsProvider
  if (input.ttsSpeed !== undefined) body.tts_speed = input.ttsSpeed
  if (input.defaultScenarioKey !== undefined) body.default_scenario_key = input.defaultScenarioKey
  if (input.defaultAccentKey !== undefined) body.default_accent_key = input.defaultAccentKey

  if (Object.keys(body).length === 0) return

  try {
    const api = createMeteorVoiceApiClient({ baseUrl: input.apiBaseUrl, headers: input.getAuthHeaders })
    await api.updatePreferences(body)
    // 成功后清除 pending
    pendingSyncKeys.clear()
  } catch {
    // 静默失败，记录待同步项（应用重启后下次 API 拉取会自动覆盖）
    for (const key of Object.keys(body)) {
      pendingSyncKeys.add(key)
    }
  }
}

export async function pullMobilePreferences(
  apiBaseUrl: string,
  getAuthHeaders: () => HeadersInit,
): Promise<{
  ttsProvider: string
  ttsSpeed: number
  defaultScenarioKey: string
  defaultAccentKey: string
  locale: string
  availableProviders: string[]
} | null> {
  if (!apiBaseUrl) return null

  const authed = await hasAuth(getAuthHeaders)
  if (!authed) return null

  try {
    const api = createMeteorVoiceApiClient({ baseUrl: apiBaseUrl, headers: getAuthHeaders })
    const prefs = await api.getPreferences()
    pendingSyncKeys.clear()
    return {
      ttsProvider: prefs.tts_provider ?? 'mock',
      ttsSpeed: prefs.tts_speed ?? 1,
      defaultScenarioKey: prefs.default_scenario_key ?? 'small-talk',
      defaultAccentKey: prefs.default_accent_key ?? 'american',
      locale: prefs.locale ?? 'en',
      availableProviders: prefs.available_providers ?? [],
    }
  } catch {
    return null
  }
}

export function hasPendingMobileSyncs() {
  return pendingSyncKeys.size > 0
}
