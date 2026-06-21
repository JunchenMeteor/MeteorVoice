/**
 * Settings preferences state and side-effect operations.
 * 设置偏好状态与副作用操作。
 */

import * as SecureStore from 'expo-secure-store'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { PreferencesResponse } from '@meteorvoice/api-client'
import type {
  Locale,
  TranslateFn,
  VoiceProfile,
} from '@meteorvoice/shared'
import {
  createMeteorVoiceApiClient,
  formatApiRequestError,
} from '@meteorvoice/api-client'
import {
  appFeedback,
  displayErrorFeedback,
  runAppOperationGroup,
} from '@meteorvoice/shared'

import type { MobileAuthState } from '../mobileAuth'
import type { XunfeiVoice } from '../mobilePreferences'
import type { ThemeKey } from '../theme'
import { syncMobilePreferences } from '../mobilePreferences'

interface UseSettingsPreferencesStateInput {
  auth: MobileAuthState
  clearAudio: () => void
  ctxAccentKey: string
  ctxScenarioKey: string
  ctxTtsProvider: string
  ctxTtsVoiceId: string | null
  defaultApiBaseUrl: string
  getAuthHeaders: () => Promise<HeadersInit>
  handleUnauthorized: () => void
  locale: Locale
  logMetric: (name: string, data?: Record<string, unknown>) => void
  onLocaleChange: (locale: Locale) => void
  setThemeLocal: (theme: ThemeKey) => void
  tr: TranslateFn
}

export function useSettingsPreferencesState({
  auth,
  clearAudio,
  ctxAccentKey,
  ctxScenarioKey,
  ctxTtsProvider,
  ctxTtsVoiceId,
  defaultApiBaseUrl,
  getAuthHeaders,
  handleUnauthorized,
  locale,
  logMetric,
  onLocaleChange,
  setThemeLocal,
  tr,
}: UseSettingsPreferencesStateInput) {
  // ─── State / 状态 ───
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null)
  const settingsRequestRef = useRef(0)
  const settingsLoadingRef = useRef(false)
  const settingsAutoLoadRef = useRef(false)
  const prefSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const themeInitializedRef = useRef(false)

  // Preferences state
  const [ttsProvider, setTtsProvider] = useState(ctxTtsProvider ?? 'mock')
  const [availableProviders, setAvailableProviders] = useState<string[]>(['mock'])
  const [ttsSpeed, setTtsSpeedLocal] = useState(1)
  const [ttsVoiceId, setTtsVoiceId] = useState<string | null>(ctxTtsVoiceId)
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([])
  const [selectedVoiceProfileId, setSelectedVoiceProfileId] = useState<string | null>(null)
  const [xunfeiVoices, setXunfeiVoices] = useState<XunfeiVoice[]>([])
  const [sessionSttProvider, setSessionSttProviderLocal] = useState<'native' | 'xunfei'>('native')
  const [availableSessionSttProviders, setAvailableSessionSttProviders] = useState<('native' | 'xunfei')[]>(['native'])
  const [apiBaseUrl, setApiBaseUrlRaw] = useState(defaultApiBaseUrl)
  const [apiBaseUrlSource, setApiBaseUrlSource] = useState<'default' | 'user'>('default')

  // Hydrate API URL from SecureStore on mount
  useEffect(() => {
    SecureStore.getItemAsync('api_base_url').then(v => {
      const stored = v?.trim()
      if (stored && stored !== defaultApiBaseUrl) { setApiBaseUrlRaw(stored); setApiBaseUrlSource('user') }
    })
  }, [defaultApiBaseUrl])

  const setApiBaseUrl = useCallback((value: string) => {
    setApiBaseUrlRaw(value)
    const normalized = value.trim()
    if (!normalized || normalized === defaultApiBaseUrl) {
      setApiBaseUrlSource('default')
      void SecureStore.deleteItemAsync('api_base_url')
    } else {
      setApiBaseUrlSource('user')
      void SecureStore.setItemAsync('api_base_url', normalized)
    }
  }, [defaultApiBaseUrl])

  const api = useMemo(() => createMeteorVoiceApiClient({
    baseUrl: apiBaseUrl.trim(),
    headers: getAuthHeaders,
    onUnauthorized: handleUnauthorized,
  }), [apiBaseUrl, getAuthHeaders, handleUnauthorized])

  const setSettingsLoadingFlag = useCallback((loading: boolean) => {
    settingsLoadingRef.current = loading
    setSettingsLoading(loading)
    if (loading) {
      appFeedback.show({ message: tr('settings.syncing'), variant: 'hud', source: 'settings' })
    } else {
      appFeedback.hide('settings')
    }
  }, [tr])

  const setLocale = useCallback((l: Locale) => {
    onLocaleChange(l)
  }, [onLocaleChange])
  const setTheme = useCallback((k: ThemeKey) => { setThemeLocal(k) }, [setThemeLocal])

  // ─── Preference Helpers / 偏好辅助 ───
  const applyTtsPreferences = useCallback((prefs: PreferencesResponse, msg = tr('session.status.preferences_saved')) => {
    setTtsProvider(prefs.tts_provider ?? 'mock')
    setTtsSpeedLocal(prefs.tts_speed ?? 1)
    if (prefs.tts_voice_id !== undefined) setTtsVoiceId(prefs.tts_voice_id)
    if (prefs.selected_voice_profile_id !== undefined) setSelectedVoiceProfileId(prefs.selected_voice_profile_id)
    const profiles = prefs.voice_profiles ?? voiceProfiles
    const profile = profiles.find(p => p.id === prefs.selected_voice_profile_id)
    if (profile && !ctxAccentKey) { /* accentKey managed by SessionContext */ }
    setSettingsMessage(msg)
  }, [tr, voiceProfiles, ctxAccentKey])

  const applyPracticePreferences = useCallback((prefs: PreferencesResponse, msg = tr('session.status.practice_defaults_saved')) => {
    setTtsProvider(prefs.tts_provider ?? 'mock')
    setTtsSpeedLocal(prefs.tts_speed ?? 1)
    setSettingsMessage(msg)
  }, [tr])

  const applyVoiceProfilePreferences = useCallback((prefs: PreferencesResponse, msg = tr('session.status.preferences_saved')) => {
    setTtsProvider(prefs.tts_provider ?? 'mock')
    if (prefs.tts_voice_id !== undefined) setTtsVoiceId(prefs.tts_voice_id)
    if (prefs.selected_voice_profile_id !== undefined) setSelectedVoiceProfileId(prefs.selected_voice_profile_id)
    setSettingsMessage(msg)
  }, [tr])

  const applySessionSttProviders = useCallback((providers: ('native' | 'xunfei')[]) => {
    setAvailableSessionSttProviders(providers)
    if (!providers.includes(sessionSttProvider)) {
      setSessionSttProviderLocal('native')
      void SecureStore.setItemAsync('session_stt_provider', 'native')
    }
  }, [sessionSttProvider])

  // ─── Load Operations / 加载操作 ───
  const loadPreferences = useCallback(async (options: { force?: boolean; successMessage?: string } = {}) => {
    if (settingsLoadingRef.current && !options.force) return
    if (auth.state !== 'signed-in') { setSettingsMessage(tr('settings.auth_required')); return }
    const requestId = ++settingsRequestRef.current
    setSettingsLoadingFlag(true)
    setSettingsMessage(null)
    try {
      const prefs = await api.getPreferences()
      if (requestId !== settingsRequestRef.current) return
      setLocale(prefs.locale === 'zh' ? 'zh' : 'en')
      setTtsProvider(prefs.tts_provider ?? 'mock')
      setAvailableProviders(prefs.available_providers?.length ? prefs.available_providers : ['mock'])
      setTtsSpeedLocal(prefs.tts_speed ?? 1)
      if (prefs.tts_voice_id !== undefined) setTtsVoiceId(prefs.tts_voice_id)
      if (prefs.voice_profiles) setVoiceProfiles(prefs.voice_profiles)
      if (prefs.selected_voice_profile_id !== undefined) setSelectedVoiceProfileId(prefs.selected_voice_profile_id)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ext = prefs as Record<string, any>
      if (ext.xunfei_voices?.configured) setXunfeiVoices(ext.xunfei_voices.configured)
      if (prefs.ui_theme && !themeInitializedRef.current) {
        themeInitializedRef.current = true
        void SecureStore.getItemAsync('theme_set_at').then(localSetAt => {
          const serverTs = new Date(ext.ui_theme_updated_at ?? new Date(0).toISOString()).getTime()
          const localTs = localSetAt ? new Date(localSetAt).getTime() : 0
          if (serverTs >= localTs) setThemeLocal(prefs.ui_theme as ThemeKey)
        })
      }
      setSettingsMessage(options.successMessage ?? tr('session.status.preferences_loaded'))
    } catch (error) {
      const reqErr = formatApiRequestError(error, { context: 'mobile_preferences_load', presentation: 'inline' })
      setSettingsMessage(reqErr.displayMessage)
    } finally {
      if (requestId === settingsRequestRef.current) setSettingsLoadingFlag(false)
    }
  }, [api, auth.state, setSettingsLoadingFlag, setLocale, setThemeLocal, tr])

  const loadSettingsDataGroup = useCallback(() => {
    if (settingsLoadingRef.current) return () => undefined
    if (auth.state !== 'signed-in') { setSettingsMessage(tr('settings.auth_required')); return () => undefined }
    let cancelled = false
    const requestId = ++settingsRequestRef.current
    setSettingsLoadingFlag(true)
    void runAppOperationGroup({
      source: 'mobile_settings_data',
      tasks: { preferences: () => api.getPreferences(), providers: () => api.listASRProviders() },
    }).then(({ preferences: prefR, providers: provR }) => {
      if (cancelled || requestId !== settingsRequestRef.current) return
      if (prefR.status === 'fulfilled') {
        const prefs = prefR.value
        setLocale(prefs.locale === 'zh' ? 'zh' : 'en')
        setTtsProvider(prefs.tts_provider ?? 'mock')
        setAvailableProviders(prefs.available_providers?.length ? prefs.available_providers : ['mock'])
        setTtsSpeedLocal(prefs.tts_speed ?? 1)
        if (prefs.tts_voice_id !== undefined) setTtsVoiceId(prefs.tts_voice_id)
        if (prefs.voice_profiles) setVoiceProfiles(prefs.voice_profiles)
        if (prefs.selected_voice_profile_id !== undefined) setSelectedVoiceProfileId(prefs.selected_voice_profile_id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extPrefs = prefs as Record<string, any>
        if (extPrefs.xunfei_voices?.configured) setXunfeiVoices(extPrefs.xunfei_voices.configured)
        if (prefs.ui_theme && !themeInitializedRef.current) {
          themeInitializedRef.current = true
          void SecureStore.getItemAsync('theme_set_at').then(localSetAt => {
            const srvTs = new Date(extPrefs.ui_theme_updated_at ?? new Date(0).toISOString()).getTime()
            const localTs = localSetAt ? new Date(localSetAt).getTime() : 0
            if (srvTs >= localTs) setThemeLocal(prefs.ui_theme as ThemeKey)
          })
        }
      } else {
        const reqErr = formatApiRequestError(prefR.reason, { context: 'mobile_preferences_load', presentation: 'inline' })
        setSettingsMessage(reqErr.displayMessage)
      }
      if (provR.status === 'fulfilled') {
        const providers: ('native' | 'xunfei')[] = ['native']
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const provList = (provR.value as Record<string, any>).providers as Array<{ key: string; enabled: boolean }> | undefined
        if (provList?.some(p => p.key === 'xunfei' && p.enabled)) providers.push('xunfei')
        applySessionSttProviders(providers)
      }
    }).finally(() => { if (!cancelled && requestId === settingsRequestRef.current) setSettingsLoadingFlag(false) })
    return () => { cancelled = true }
  }, [api, auth.state, setSettingsLoadingFlag, setLocale, setThemeLocal, applySessionSttProviders, tr])

  // ─── Save Operations / 保存操作 ───
  const saveProvider = useCallback(async (provider: string) => {
    settingsRequestRef.current += 1
    setTtsProvider(provider)
    clearAudio()
    setSettingsLoadingFlag(true); setSettingsMessage(null)
    if (auth.state !== 'signed-in') { setSettingsMessage(tr('session.status.preferences_saved')); setSettingsLoadingFlag(false); return }
    try {
      const prefs = await api.updatePreferences({ tts_provider: provider, tts_speed: ttsSpeed })
      applyTtsPreferences(prefs)
    } catch (error) {
      const reqErr = formatApiRequestError(error, { context: 'mobile_preferences_save_provider', presentation: 'inline' })
      setSettingsMessage(reqErr.displayMessage)
    } finally { setSettingsLoadingFlag(false) }
  }, [api, auth.state, ttsSpeed, applyTtsPreferences, setSettingsLoadingFlag, tr])

  const savePracticePreferences = useCallback(async () => {
    settingsRequestRef.current += 1
    setSettingsLoadingFlag(true); setSettingsMessage(null)
    if (auth.state !== 'signed-in') { setSettingsMessage(tr('session.status.practice_defaults_saved')); setSettingsLoadingFlag(false); return }
    try {
      const prefs = await api.updatePreferences({ tts_provider: ttsProvider, tts_speed: ttsSpeed })
      applyPracticePreferences(prefs)
    } catch (error) {
      const reqErr = formatApiRequestError(error, { context: 'mobile_preferences_save_practice', presentation: 'inline' })
      setSettingsMessage(reqErr.displayMessage)
    } finally { setSettingsLoadingFlag(false) }
  }, [api, auth.state, ttsProvider, ttsSpeed, applyPracticePreferences, setSettingsLoadingFlag, tr])

  const adjustSpeed = useCallback((delta: number) => {
    setTtsSpeedLocal(prev => {
      const next = Math.min(1.3, Math.max(0.7, Number((prev + delta).toFixed(1))))
      if (prefSyncTimerRef.current) clearTimeout(prefSyncTimerRef.current)
      prefSyncTimerRef.current = setTimeout(() => {
        void syncMobilePreferences({
          apiBaseUrl: apiBaseUrl.trim(), getAuthHeaders, onUnauthorized: handleUnauthorized,
          ttsSpeed: next, ttsProvider, defaultScenarioKey: ctxScenarioKey,
        }).then(prefs => { if (prefs) applyTtsPreferences(prefs) })
      }, 600)
      return next
    })
  }, [apiBaseUrl, ctxScenarioKey, getAuthHeaders, handleUnauthorized, ttsProvider, applyTtsPreferences])

  const selectVoiceProfile = useCallback(async (profile: VoiceProfile) => {
    if (profile.status !== 'active') return
    settingsRequestRef.current += 1
    clearAudio()
    setSelectedVoiceProfileId(profile.id)
    setTtsProvider(profile.provider)
    setTtsVoiceId(profile.providerVoiceId)
    setSettingsMessage(null)
    if (auth.state !== 'signed-in') return
    try {
      const prefs = await api.updatePreferences({ selected_voice_profile_id: profile.id })
      applyVoiceProfilePreferences(prefs)
    } catch (error) {
      const reqErr = formatApiRequestError(error, { context: 'mobile_preferences_select_voice_profile', presentation: 'silent' })
      logMetric('mobile_silent_request_error', reqErr.logData)
    }
  }, [api, auth.state, applyVoiceProfilePreferences, logMetric])

  const saveLocalePreference = useCallback(async (nextLocale: Locale) => {
    if (nextLocale === locale) return
    setLocale(nextLocale)
    if (auth.state !== 'signed-in') { setSettingsMessage(tr('settings.auth_required')); return }
    const requestId = ++settingsRequestRef.current
    setSettingsLoadingFlag(true); setSettingsMessage(null)
    try {
      await api.updatePreferences({ locale: nextLocale })
      if (requestId !== settingsRequestRef.current) return
      setSettingsMessage(tr('session.status.preferences_saved'))
    } catch (error) {
      const reqErr = formatApiRequestError(error, { context: 'mobile_preferences_save_locale', presentation: 'banner' })
      setSettingsMessage(reqErr.displayMessage)
      displayErrorFeedback(reqErr, 'mobile_preferences_save_locale')
    } finally { if (requestId === settingsRequestRef.current) setSettingsLoadingFlag(false) }
  }, [api, auth.state, locale, setLocale, setSettingsLoadingFlag, tr])

  // ─── Auto-load / 自动加载 ───
  useEffect(() => {
    if (auth.state !== 'signed-in') { settingsAutoLoadRef.current = false; return }
    if (settingsAutoLoadRef.current) return
    settingsAutoLoadRef.current = true
    const cleanup = loadSettingsDataGroup()
    return cleanup
  }, [auth.state, loadSettingsDataGroup])

  const onSetLocale = (l: string) => { void saveLocalePreference(l as Locale) }
  const onSetTheme = setTheme
  const onSaveProvider = saveProvider
  const onSetSessionSttProvider = (p: 'native' | 'xunfei') => {
    setSessionSttProviderLocal(p)
    void SecureStore.setItemAsync('session_stt_provider', p)
  }
  const onAdjustSpeed = adjustSpeed
  const onSavePracticePreferences = savePracticePreferences
  const onLoadPreferences = () => { void loadPreferences() }
  const onSelectVoiceProfile = selectVoiceProfile
  const onSetApiBaseUrl = setApiBaseUrl
  const onResetApiBaseUrl = () => setApiBaseUrl(defaultApiBaseUrl)
  const speedFill = Math.max(0, Math.min(1, (ttsSpeed - 0.7) / 0.6))
  const providerVoiceProfiles = voiceProfiles.filter(profile => profile.provider === ttsProvider)
  const selectedVoiceProfile = voiceProfiles.find(profile => profile.id === selectedVoiceProfileId)
    ?? providerVoiceProfiles.find(profile => profile.providerVoiceId === ttsVoiceId)
    ?? providerVoiceProfiles.find(profile => profile.status === 'active')

  function voiceProfileMeta(profile: VoiceProfile) {
    const providerLabel = tr(`settings.tts_provider_${profile.provider}`) !== `settings.tts_provider_${profile.provider}`
      ? tr(`settings.tts_provider_${profile.provider}`)
      : profile.provider
    const gender = profile.gender ? tr(`settings.xunfei_voice_gender_${profile.gender}`) : null
    const language = profile.locale === 'zh' ? tr('settings.xunfei_voice_language_zh') : tr('settings.xunfei_voice_language_en')
    const tier = profile.qualityTier ? tr(`settings.xunfei_voice_tier_${profile.qualityTier}`) : null
    return [providerLabel, language, gender, tier, profile.accentLabel, profile.accentRegion, profile.style].filter(Boolean).join(' · ')
  }

  function voiceProfileName(profile: VoiceProfile) {
    return locale === 'zh' ? profile.displayNameZh ?? profile.displayName : profile.displayName
  }


  return {
    apiBaseUrl,
    apiBaseUrlSource,
    availableProviders,
    availableSessionSttProviders,
    onAdjustSpeed,
    onLoadPreferences,
    onResetApiBaseUrl,
    onSavePracticePreferences,
    onSaveProvider,
    onSelectVoiceProfile,
    onSetApiBaseUrl,
    onSetLocale,
    onSetSessionSttProvider,
    onSetTheme,
    providerVoiceProfiles,
    selectedVoiceProfile,
    sessionSttProvider,
    settingsLoading,
    settingsMessage,
    speedFill,
    ttsProvider,
    ttsSpeed,
    voiceProfileMeta,
    voiceProfileName,
    xunfeiVoices,
  }
}
