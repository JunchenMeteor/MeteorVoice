import { useCallback, type Dispatch, type SetStateAction } from 'react'
import * as SecureStore from 'expo-secure-store'
import { formatApiRequestError, type PreferencesResponse } from '@meteorvoice/api-client'
import { runAppOperationGroup, displayErrorFeedback, type Locale, type VoiceProfile } from '@meteorvoice/shared'
import { syncMobilePreferences } from '../mobilePreferences'
import type { SessionSttProvider, ApiBaseUrlSource } from '../sessionRuntime'

export interface PreferencesDeps {
  api: {
    getPreferences: () => Promise<PreferencesResponse>
    updatePreferences: (params: Record<string, unknown>) => Promise<PreferencesResponse>
    listASRProviders: () => Promise<{ providers: Array<{ key: string; enabled: boolean }> }>
  }
  authState: string
  auth: {
    getAuthHeaders: () => Promise<Record<string, string>>
    state: string
  }
  handleUnauthorized: () => void
  ttsProvider: string
  ttsSpeed: number
  selectedScenarioKey: string
  locale: Locale
  apiBaseUrl: string
  voiceProfiles: VoiceProfile[]
  sessionSttProvider: SessionSttProvider
  appliedThemeRef: React.MutableRefObject<boolean>
  // State setters
  setLocale: (l: Locale) => void
  setTtsProvider: Dispatch<SetStateAction<string>>
  setAvailableProviders: Dispatch<SetStateAction<string[]>>
  setTtsSpeed: Dispatch<SetStateAction<number>>
  setTtsVoiceId: Dispatch<SetStateAction<string | null>>
  setVoiceProfiles: Dispatch<SetStateAction<VoiceProfile[]>>
  setSelectedVoiceProfileId: Dispatch<SetStateAction<string | null>>
  setXunfeiVoices: Dispatch<SetStateAction<Array<{ configured?: unknown[] }>>>
  setSelectedScenarioKey: Dispatch<SetStateAction<string>>
  setSelectedAccentKey: Dispatch<SetStateAction<string>>
  setSettingsMessage: Dispatch<SetStateAction<string | null>>
  setSettingsLoading: Dispatch<SetStateAction<boolean>>
  setAvailableSessionSttProviders: Dispatch<SetStateAction<SessionSttProvider[]>>
  setSessionSttProvider: Dispatch<SetStateAction<SessionSttProvider>>
  // Theme
  setTheme: (k: string) => void
  // Refs & util
  sessionSttProviderRef: React.MutableRefObject<SessionSttProvider>
  settingsRequestRef: React.MutableRefObject<number>
  settingsAutoLoadRef: React.MutableRefObject<boolean>
  sessionSttProvidersLoadedRef: React.MutableRefObject<boolean>
  setSettingsLoadingFlag: (loading: boolean) => void
  logVoiceMetric: (stage: string, data?: Record<string, unknown>) => void
  tr: (key: string) => string
}

export interface PreferencesReturn {
  loadPreferences: (options?: { force?: boolean; successMessage?: string }) => Promise<void>
  loadSettingsDataGroup: () => (() => void)
  reloadSettingsData: () => void
  saveProvider: (provider: string) => Promise<void>
  savePracticePreferences: () => Promise<void>
  adjustSpeed: (delta: number) => void
  selectVoiceProfile: (profile: VoiceProfile) => Promise<void>
  saveLocalePreference: (nextLocale: Locale) => Promise<void>
  applyPreferences: (prefs: PreferencesResponse, successMessage?: string) => void
}

export function usePreferences(deps: PreferencesDeps): PreferencesReturn {
  const {
    api, authState, auth, handleUnauthorized, ttsProvider, ttsSpeed,
    selectedScenarioKey, locale, apiBaseUrl, voiceProfiles, sessionSttProvider,
    appliedThemeRef,
    setLocale, setTtsProvider, setAvailableProviders, setTtsSpeed, setTtsVoiceId,
    setVoiceProfiles, setSelectedVoiceProfileId, setXunfeiVoices,
    setSelectedScenarioKey, setSelectedAccentKey, setSettingsMessage, setSettingsLoading,
    setAvailableSessionSttProviders, setSessionSttProvider, setTheme,
    sessionSttProviderRef, settingsRequestRef, settingsAutoLoadRef,
    sessionSttProvidersLoadedRef, setSettingsLoadingFlag,
    logVoiceMetric, tr,
  } = deps

  const sessionSttProviderStorageKey = 'session_stt_provider'

  const applyPreferences = useCallback((preferences: PreferencesResponse, successMessage?: string) => {
    setLocale(preferences.locale === 'zh' ? 'zh' : 'en')
    setTtsProvider(preferences.tts_provider ?? 'mock')
    setAvailableProviders(preferences.available_providers?.length ? preferences.available_providers : ['mock'])
    setTtsSpeed(preferences.tts_speed ?? 1)
    if (preferences.tts_voice_id !== undefined) setTtsVoiceId(preferences.tts_voice_id)
    if (preferences.voice_profiles) setVoiceProfiles(preferences.voice_profiles)
    if (preferences.selected_voice_profile_id !== undefined) setSelectedVoiceProfileId(preferences.selected_voice_profile_id)
    if ((preferences as any).xunfei_voices?.configured) setXunfeiVoices((preferences as any).xunfei_voices.configured)
    if (preferences.default_scenario_key) setSelectedScenarioKey(preferences.default_scenario_key)
    const profile = preferences.voice_profiles?.find(item => item.id === preferences.selected_voice_profile_id)
    if (profile) setSelectedAccentKey(profile.accentKey)
    if (preferences.ui_theme && !appliedThemeRef.current) {
      appliedThemeRef.current = true
      void SecureStore.getItemAsync('theme_set_at').then(localSetAt => {
        const serverTs = new Date((preferences as any).ui_theme_updated_at ?? new Date(0).toISOString()).getTime()
        const localTs = localSetAt ? new Date(localSetAt).getTime() : 0
        if (serverTs >= localTs) {
          setTheme(preferences.ui_theme as string)
        }
      })
    }
    setSettingsMessage(successMessage ?? tr('session.status.preferences_loaded'))
  }, [setLocale, setTtsProvider, setAvailableProviders, setTtsSpeed, setTtsVoiceId,
    setVoiceProfiles, setSelectedVoiceProfileId, setXunfeiVoices,
    setSelectedScenarioKey, setSelectedAccentKey, setSettingsMessage, setTheme,
    appliedThemeRef, tr])

  const applyTtsPreferences = useCallback((preferences: PreferencesResponse, successMessage = tr('session.status.preferences_saved')) => {
    setTtsProvider(preferences.tts_provider ?? 'mock')
    setTtsSpeed(preferences.tts_speed ?? 1)
    if (preferences.tts_voice_id !== undefined) setTtsVoiceId(preferences.tts_voice_id)
    if (preferences.selected_voice_profile_id !== undefined) setSelectedVoiceProfileId(preferences.selected_voice_profile_id)
    const profiles = preferences.voice_profiles ?? voiceProfiles
    const profile = profiles.find(item => item.id === preferences.selected_voice_profile_id)
    if (profile) setSelectedAccentKey(profile.accentKey)
    setSettingsMessage(successMessage)
  }, [tr, voiceProfiles, setTtsProvider, setTtsSpeed, setTtsVoiceId, setSelectedVoiceProfileId, setSelectedAccentKey, setSettingsMessage])

  const applyPracticePreferences = useCallback((preferences: PreferencesResponse, successMessage = tr('session.status.practice_defaults_saved')) => {
    setTtsProvider(preferences.tts_provider ?? 'mock')
    setTtsSpeed(preferences.tts_speed ?? 1)
    if (preferences.default_scenario_key) setSelectedScenarioKey(preferences.default_scenario_key)
    setSettingsMessage(successMessage)
  }, [tr, setTtsProvider, setTtsSpeed, setSelectedScenarioKey, setSettingsMessage])

  const applyVoiceProfilePreferences = useCallback((preferences: PreferencesResponse, successMessage = tr('session.status.preferences_saved')) => {
    setTtsProvider(preferences.tts_provider ?? 'mock')
    if (preferences.tts_voice_id !== undefined) setTtsVoiceId(preferences.tts_voice_id)
    if (preferences.selected_voice_profile_id !== undefined) setSelectedVoiceProfileId(preferences.selected_voice_profile_id)
    const profiles = preferences.voice_profiles ?? voiceProfiles
    const profile = profiles.find(item => item.id === preferences.selected_voice_profile_id)
    if (profile) setSelectedAccentKey(profile.accentKey)
    setSettingsMessage(successMessage)
  }, [tr, voiceProfiles, setTtsProvider, setTtsVoiceId, setSelectedVoiceProfileId, setSelectedAccentKey, setSettingsMessage])

  const applyLocalePreferences = useCallback((preferences: PreferencesResponse, successMessage = tr('session.status.preferences_saved')) => {
    setLocale(preferences.locale === 'zh' ? 'zh' : 'en')
    setSettingsMessage(successMessage)
  }, [setLocale, tr, setSettingsMessage])

  const applySessionSttProvidersFn = useCallback((providers: SessionSttProvider[]) => {
    setAvailableSessionSttProviders(providers)
    if (!providers.includes(sessionSttProvider)) {
      sessionSttProviderRef.current = 'native'
      setSessionSttProvider('native')
      void SecureStore.setItemAsync(sessionSttProviderStorageKey, 'native')
    }
  }, [sessionSttProvider, sessionSttProviderRef, setAvailableSessionSttProviders, setSessionSttProvider])

  const loadPreferences = useCallback(async (options: { force?: boolean; successMessage?: string } = {}) => {
    if (authState !== 'signed-in') {
      setSettingsMessage(tr('settings.auth_required'))
      return
    }
    const requestId = ++settingsRequestRef.current
    setSettingsLoadingFlag(true)
    setSettingsMessage(null)
    try {
      const preferences = await api.getPreferences()
      if (requestId !== settingsRequestRef.current) return
      applyPreferences(preferences, options.successMessage)
    } catch (error) {
      const requestError = formatApiRequestError(error, {
        context: 'mobile_preferences_load', presentation: 'inline',
      })
      setSettingsMessage(requestError.displayMessage)
    } finally {
      if (requestId === settingsRequestRef.current) {
        setSettingsLoadingFlag(false)
      }
    }
  }, [api, applyPreferences, authState, setSettingsMessage, setSettingsLoadingFlag, settingsRequestRef, tr])

  const loadSettingsDataGroup = useCallback(() => {
    if (authState !== 'signed-in') {
      setSettingsMessage(tr('settings.auth_required'))
      return () => undefined
    }

    let cancelled = false
    const requestId = ++settingsRequestRef.current
    setSettingsLoadingFlag(true)
    setSettingsMessage(null)

    void runAppOperationGroup({
      source: 'mobile_settings_data',
      tasks: {
        preferences: () => api.getPreferences(),
        providers: () => api.listASRProviders(),
      },
    }).then(({ preferences: preferencesResult, providers: providersResult }) => {
      if (cancelled || requestId !== settingsRequestRef.current) return

      if (preferencesResult.status === 'fulfilled') {
        applyPreferences(preferencesResult.value)
      } else {
        const requestError = formatApiRequestError(preferencesResult.reason, {
          context: 'mobile_preferences_load', presentation: 'inline',
        })
        setSettingsMessage(requestError.displayMessage)
      }

      if (providersResult.status === 'fulfilled') {
        applySessionSttProvidersFn(
          (providersResult.value as any).providers.some((p: { key: string; enabled: boolean }) => p.key === 'xunfei' && p.enabled)
            ? ['native', 'xunfei'] as SessionSttProvider[]
            : ['native'] as SessionSttProvider[]
        )
      }
    }).finally(() => {
      if (!cancelled && requestId === settingsRequestRef.current) {
        setSettingsLoadingFlag(false)
      }
    })

    return () => { cancelled = true }
  }, [
    api, applyPreferences, authState, setSettingsMessage, setSettingsLoadingFlag,
    settingsRequestRef, applySessionSttProvidersFn, tr,
  ])

  const reloadSettingsData = useCallback(() => loadSettingsDataGroup(), [loadSettingsDataGroup])

  const saveProvider = useCallback(async (provider: string) => {
    settingsRequestRef.current += 1
    setTtsProvider(provider)
    setSettingsLoadingFlag(true)
    setSettingsMessage(null)
    if (authState !== 'signed-in') {
      setSettingsMessage(tr('session.status.preferences_saved'))
      setSettingsLoadingFlag(false)
      return
    }

    try {
      const preferences = await api.updatePreferences({
        tts_provider: provider, default_scenario_key: selectedScenarioKey, tts_speed: ttsSpeed,
      })
      applyTtsPreferences(preferences)
    } catch (error) {
      const requestError = formatApiRequestError(error, {
        context: 'mobile_preferences_save_provider', presentation: 'inline',
      })
      setSettingsMessage(requestError.displayMessage)
    } finally {
      setSettingsLoadingFlag(false)
    }
  }, [api, authState, selectedScenarioKey, ttsSpeed, applyTtsPreferences,
    settingsRequestRef, setTtsProvider, setSettingsLoadingFlag, setSettingsMessage, tr])

  const savePracticePreferences = useCallback(async () => {
    settingsRequestRef.current += 1
    setSettingsLoadingFlag(true)
    setSettingsMessage(null)
    if (authState !== 'signed-in') {
      setSettingsMessage(tr('session.status.practice_defaults_saved'))
      setSettingsLoadingFlag(false)
      return
    }

    try {
      const preferences = await api.updatePreferences({
        tts_provider: ttsProvider, default_scenario_key: selectedScenarioKey, tts_speed: ttsSpeed,
      })
      applyPracticePreferences(preferences)
    } catch (error) {
      const requestError = formatApiRequestError(error, {
        context: 'mobile_preferences_save_practice', presentation: 'inline',
      })
      setSettingsMessage(requestError.displayMessage)
    } finally {
      setSettingsLoadingFlag(false)
    }
  }, [api, authState, ttsProvider, selectedScenarioKey, ttsSpeed, applyPracticePreferences,
    settingsRequestRef, setSettingsLoadingFlag, setSettingsMessage, tr])

  const adjustSpeed = useCallback((delta: number) => {
    setTtsSpeed(previous => {
      const next = Math.min(1.3, Math.max(0.7, Number((previous + delta).toFixed(1))))
      void syncMobilePreferences({
        apiBaseUrl: apiBaseUrl.trim(),
        getAuthHeaders: auth.getAuthHeaders,
        onUnauthorized: handleUnauthorized,
        ttsSpeed: next, ttsProvider, defaultScenarioKey: selectedScenarioKey,
      }).then(preferences => {
        if (preferences) applyTtsPreferences(preferences)
      })
      return next
    })
  }, [apiBaseUrl, auth.getAuthHeaders, handleUnauthorized, ttsProvider, selectedScenarioKey,
    applyTtsPreferences, setTtsSpeed])

  const selectVoiceProfile = useCallback(async (profile: VoiceProfile) => {
    if (profile.status !== 'active') return
    settingsRequestRef.current += 1
    setSelectedVoiceProfileId(profile.id)
    setTtsProvider(profile.provider)
    setTtsVoiceId(profile.providerVoiceId)
    setSelectedAccentKey(profile.accentKey)
    setSettingsMessage(null)
    if (authState !== 'signed-in') return

    try {
      const preferences = await api.updatePreferences({ selected_voice_profile_id: profile.id })
      applyVoiceProfilePreferences(preferences)
    } catch (error) {
      const requestError = formatApiRequestError(error, {
        context: 'mobile_preferences_select_voice_profile', presentation: 'silent',
      })
      logVoiceMetric('mobile_silent_request_error', requestError.logData)
    }
  }, [api, authState, applyVoiceProfilePreferences, settingsRequestRef,
    setSelectedVoiceProfileId, setTtsProvider, setTtsVoiceId, setSelectedAccentKey,
    setSettingsMessage, logVoiceMetric])

  const saveLocalePreference = useCallback(async (nextLocale: Locale) => {
    if (nextLocale === locale) return
    setLocale(nextLocale)

    if (authState !== 'signed-in') {
      setSettingsMessage(tr('settings.auth_required'))
      return
    }

    const requestId = ++settingsRequestRef.current
    setSettingsLoadingFlag(true)
    setSettingsMessage(null)
    try {
      const preferences = await api.updatePreferences({ locale: nextLocale })
      if (requestId !== settingsRequestRef.current) return
      applyLocalePreferences(preferences)
    } catch (error) {
      const requestError = formatApiRequestError(error, {
        context: 'mobile_preferences_save_locale', presentation: 'banner',
      })
      setSettingsMessage(requestError.displayMessage)
      displayErrorFeedback(requestError, 'mobile_preferences_save_locale')
    } finally {
      if (requestId === settingsRequestRef.current) setSettingsLoadingFlag(false)
    }
  }, [locale, setLocale, authState, api, applyLocalePreferences,
    settingsRequestRef, setSettingsLoadingFlag, setSettingsMessage, tr, logVoiceMetric])

  return {
    loadPreferences, loadSettingsDataGroup, reloadSettingsData,
    saveProvider, savePracticePreferences, adjustSpeed, selectVoiceProfile, saveLocalePreference,
    applyPreferences,
  }
}
