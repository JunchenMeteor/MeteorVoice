/**
 * App settings and preferences screen.
 * 应用设置与偏好界面。
 */

import * as SecureStore from 'expo-secure-store'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

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

import type { XunfeiVoice } from '../mobilePreferences'
import type { ThemeKey } from '../theme'
import { useLog } from '../LogContext'
import { syncMobilePreferences } from '../mobilePreferences'
import { useSession } from '../SessionContext'
import { themeLabels } from '../theme'
import { useTheme } from '../ThemeProvider'

interface Props {
  tr: TranslateFn
  locale: Locale
  appVersion: string
  defaultApiBaseUrl: string
  auth: import('../mobileAuth').MobileAuthState
  signOut: (nextMessage?: string | null) => Promise<void>
  handleUnauthorized: () => void
  getAuthHeaders: () => Promise<HeadersInit>
  onLocaleChange: (l: Locale) => void
}

export function SettingsScreen({
  tr, locale, appVersion, defaultApiBaseUrl,
  auth, signOut, handleUnauthorized, getAuthHeaders,
  onLocaleChange,
}: Props) {
  /* eslint-disable react-hooks/exhaustive-deps */
  const { voiceMetricsText, asrEvaluationText, clearVoiceMetrics, logMetric } = useLog()
  const { ttsProvider: ctxTtsProvider, ttsVoiceId: ctxTtsVoiceId, selectedAccentKey: ctxAccentKey, selectedScenarioKey: ctxScenarioKey, clearAudio } = useSession()
  const { C, setTheme: setThemeLocal, themeKey } = useTheme()

  // ─── State / 状态 ───
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [authSubmitting, setAuthSubmitting] = useState(false)
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

  const submitAuth = useCallback(async () => {
    const normalized = email.trim()
    if (!normalized || !password || auth.state === 'loading' || authSubmitting) return
    setAuthSubmitting(true)
    appFeedback.show({ message: tr('login.loading'), variant: 'hud', source: 'auth' })
    try {
      const success = await auth.submit(authMode, normalized, password)
      if (success) setPassword('')
    } finally {
      setAuthSubmitting(false)
      appFeedback.hide('auth')
    }
  }, [email, password, auth, authSubmitting, authMode])

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
  }, [apiBaseUrl, getAuthHeaders, handleUnauthorized, ttsProvider, applyTtsPreferences])

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
  const onSetEmail = setEmail
  const onSetPassword = setPassword
  const onSetAuthMode = setAuthMode
  const onSubmitAuth = submitAuth
  const onSignOut = () => { void signOut() }
  const onSetApiBaseUrl = setApiBaseUrl
  const onResetApiBaseUrl = () => setApiBaseUrl(defaultApiBaseUrl)
  const onClearVoiceMetrics = clearVoiceMetrics
  const onShareVoiceMetrics = () => Share.share({ title: 'MeteorVoice voice diagnostics', message: voiceMetricsText })
  const onShareASREvaluation = () => Share.share({ title: 'MeteorVoice ASR evaluation', message: asrEvaluationText })
  void useTheme
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

  // ─── Styles / 样式 ───
  const styles = useMemo(() => StyleSheet.create({
    shell: { flex: 1, backgroundColor: C.bg },
    scrollView: { flex: 1 },
    content: { paddingHorizontal: 16, gap: 14 },
    title: { color: C.textPrimary, fontSize: 22, fontWeight: '800' },
    card: {
      backgroundColor: C.surface, borderRadius: 12,
      borderWidth: 1, borderColor: C.border, padding: 14, gap: 10,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { color: C.textPrimary, fontSize: 14, fontWeight: '700' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      backgroundColor: C.bg, borderRadius: 8, borderWidth: 1,
      borderColor: C.border, paddingHorizontal: 12, paddingVertical: 8,
    },
    chipActive: { backgroundColor: C.accent, borderColor: C.accent },
    chipDisabled: { opacity: 0.4 },
    chipTxt: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
    chipTxtActive: { color: C.cream },
    speedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    speedBtn: {
      width: 36, height: 36, borderRadius: 8, backgroundColor: C.bg,
      alignItems: 'center', justifyContent: 'center',
    },
    speedBtnTxt: { color: C.textPrimary, fontSize: 18, fontWeight: '700' },
    speedTrack: { flex: 1, height: 6, backgroundColor: C.bg, borderRadius: 3, overflow: 'hidden' },
    speedFill: { height: '100%', backgroundColor: C.accent, borderRadius: 3 },
    speedValue: { color: C.textPrimary, fontSize: 14, fontWeight: '700', minWidth: 40, textAlign: 'right' },
    saveBtn: {
      backgroundColor: C.accent, borderRadius: 8, padding: 12, alignItems: 'center',
    },
    saveBtnTxt: { color: C.cream, fontSize: 14, fontWeight: '700' },
    smallBtn: { backgroundColor: C.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    smallBtnTxt: { color: C.accent, fontSize: 12, fontWeight: '700' },
    hint: { color: C.textMuted, fontSize: 12 },
    hintError: { color: C.danger },
    input: {
      backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border,
      color: C.textPrimary, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10,
    },
    authForm: { gap: 10 },
    modeSwitch: { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 8, padding: 3 },
    modeBtn: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
    modeBtnActive: { backgroundColor: C.accent },
    modeBtnTxt: { color: C.textSecondary, fontSize: 12, fontWeight: '700' },
    modeBtnTxtActive: { color: C.cream },
    disabled: { opacity: 0.5 },
    cardSubtitle: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
    voiceList: { gap: 8 },
    voiceItem: {
      backgroundColor: C.bg, borderRadius: 8, borderWidth: 1,
      borderColor: C.border, padding: 10, gap: 4,
    },
    voiceItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    voiceName: { color: C.textPrimary, fontSize: 13, fontWeight: '700', flex: 1 },
    voiceBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    voiceBadgeActive: { backgroundColor: 'rgba(49,95,72,0.3)' },
    voiceBadgeExpired: { backgroundColor: 'rgba(200,60,60,0.2)' },
    voiceBadgeTxt: { color: C.textSecondary, fontSize: 10, fontWeight: '700' },
    voiceMeta: { color: C.textMuted, fontSize: 11 },
    voiceCatalogChip: {
      backgroundColor: C.bg, borderRadius: 8, borderWidth: 1,
      borderColor: C.border, paddingHorizontal: 12, paddingVertical: 8, gap: 2,
    },
    voiceCatalogName: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
    voiceCatalogMeta: { color: C.textMuted, fontSize: 11 },
    diagnosticsBox: {
      minHeight: 120,
      maxHeight: 220,
      backgroundColor: C.bg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C.border,
      padding: 10,
    },
    diagnosticsText: { color: C.textSecondary, fontSize: 11, lineHeight: 16 },
    appVersion: { color: C.textMuted, fontSize: 11, textAlign: 'center', paddingBottom: 16 },
  }), [C])

  // ─── Render / 渲染 ───
  return (
    <KeyboardAvoidingView style={styles.shell} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.title}>{tr('settings.title')}</Text>

      {/* Language */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr('settings.language')}</Text>
        <View style={styles.chipRow}>
          {(['en', 'zh'] as const).map(l => (
            <Pressable
              key={l}
              onPress={() => onSetLocale(l)}
              disabled={settingsLoading}
              style={[styles.chip, locale === l && styles.chipActive, settingsLoading && styles.chipDisabled]}
            >
              <Text style={[styles.chipTxt, locale === l && styles.chipTxtActive]}>{l === 'en' ? tr('settings.language_en') : tr('settings.language_zh')}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Theme */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr('settings.theme')}</Text>
        <View style={styles.chipGrid}>
          {(Object.keys(themeLabels) as ThemeKey[]).map(k => (
            <Pressable key={k} onPress={() => onSetTheme(k)} style={[styles.chip, themeKey === k && styles.chipActive]}>
              <Text style={[styles.chipTxt, themeKey === k && styles.chipTxtActive]}>
                {locale === 'zh' ? themeLabels[k].zh : themeLabels[k].en}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* TTS Provider */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{tr('settings.tts_provider')}</Text>
          <Pressable onPress={onLoadPreferences} disabled={settingsLoading} style={styles.smallBtn}>
            <Text style={styles.smallBtnTxt}>{settingsLoading ? '…' : tr('settings.reload')}</Text>
          </Pressable>
        </View>
        <View style={styles.chipGrid}>
          {availableProviders.map(p => (
            <Pressable
              key={p}
              onPress={() => onSaveProvider(p)}
              disabled={settingsLoading}
              style={[styles.chip, ttsProvider === p && styles.chipActive, settingsLoading && styles.chipDisabled]}
            >
              <Text style={[styles.chipTxt, ttsProvider === p && styles.chipTxtActive]}>
                {tr(`settings.tts_provider_${p}`) !== `settings.tts_provider_${p}` ? tr(`settings.tts_provider_${p}`) : p}
              </Text>
            </Pressable>
          ))}
        </View>
        {settingsMessage && <Text style={styles.hint}>{settingsMessage}</Text>}
      </View>

      {/* Session STT Provider */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr('settings.session_stt_provider')}</Text>
        <View style={styles.chipGrid}>
          {availableSessionSttProviders.map(provider => (
            <Pressable
              key={provider}
              onPress={() => onSetSessionSttProvider(provider)}
              disabled={settingsLoading}
              style={[styles.chip, sessionSttProvider === provider && styles.chipActive, settingsLoading && styles.chipDisabled]}
            >
              <Text style={[styles.chipTxt, sessionSttProvider === provider && styles.chipTxtActive]}>
                {tr(`settings.session_stt_provider_${provider}`)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>{tr('settings.session_stt_provider_hint')}</Text>
      </View>

      {/* Coach Voice */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr('settings.voice_profile_current')}</Text>
        {selectedVoiceProfile ? (
          <View style={styles.voiceItem}>
            <View style={styles.voiceItemRow}>
              <Text style={styles.voiceName}>{voiceProfileName(selectedVoiceProfile)}</Text>
              <View style={[styles.voiceBadge, selectedVoiceProfile.status === 'active' ? styles.voiceBadgeActive : styles.voiceBadgeExpired]}>
                <Text style={styles.voiceBadgeTxt}>
                  {selectedVoiceProfile.status === 'active' ? tr('settings.xunfei_voice_active') : tr('settings.voice_profile_unavailable')}
                </Text>
              </View>
            </View>
            <Text style={styles.voiceMeta}>{voiceProfileMeta(selectedVoiceProfile)}</Text>
          </View>
        ) : (
          <Text style={styles.hint}>{tr('settings.voice_profile_empty')}</Text>
        )}
        {providerVoiceProfiles.length > 0 && (
          <>
            <Text style={styles.cardSubtitle}>{tr('settings.voice_profile_select')}</Text>
            <View style={styles.chipGrid}>
              {providerVoiceProfiles.map(profile => {
                const unavailable = profile.status !== 'active'
                const active = selectedVoiceProfile?.id === profile.id
                return (
                  <Pressable
                    key={profile.id}
                    onPress={() => !unavailable && onSelectVoiceProfile(profile)}
                    disabled={settingsLoading || unavailable}
                    style={[styles.voiceCatalogChip, active && styles.chipActive, unavailable && styles.chipDisabled]}
                  >
                    <Text style={[styles.voiceCatalogName, active && styles.chipTxtActive]}>{voiceProfileName(profile)}</Text>
                    <Text style={styles.voiceCatalogMeta}>{voiceProfileMeta(profile)}</Text>
                  </Pressable>
                )
              })}
            </View>
          </>
        )}
      </View>

      {ttsProvider === 'xunfei' && xunfeiVoices.length === 0 && providerVoiceProfiles.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr('settings.xunfei_voice_config')}</Text>
          <Text style={styles.hint}>{tr('settings.xunfei_voice_empty')}</Text>
        </View>
      )}

      {/* TTS Speed */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr('settings.tts_speed')}</Text>
        <View style={styles.speedRow}>
          <Pressable onPress={() => onAdjustSpeed(-0.1)} disabled={settingsLoading} style={[styles.speedBtn, settingsLoading && styles.chipDisabled]}>
            <Text style={styles.speedBtnTxt}>−</Text>
          </Pressable>
          <View style={styles.speedTrack}>
            <View style={[styles.speedFill, { width: `${speedFill * 100}%` }]} />
          </View>
          <Pressable onPress={() => onAdjustSpeed(0.1)} disabled={settingsLoading} style={[styles.speedBtn, settingsLoading && styles.chipDisabled]}>
            <Text style={styles.speedBtnTxt}>+</Text>
          </Pressable>
          <Text style={styles.speedValue}>{ttsSpeed.toFixed(1)}×</Text>
        </View>
        <Pressable onPress={onSavePracticePreferences} disabled={settingsLoading} style={[styles.saveBtn, settingsLoading && styles.disabled]}>
          <Text style={styles.saveBtnTxt}>{tr('settings.save')}</Text>
        </Pressable>
      </View>

      {/* API URL */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{tr('settings.api_url')}</Text>
          {apiBaseUrlSource === 'user' && (
            <Pressable onPress={onResetApiBaseUrl} style={styles.smallBtn}>
              <Text style={styles.smallBtnTxt}>{tr('settings.api_url_reset')}</Text>
            </Pressable>
          )}
        </View>
        <TextInput
          style={styles.input}
          value={apiBaseUrl}
          onChangeText={onSetApiBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          placeholderTextColor={C.textMuted}
          placeholder="http://localhost:3000"
        />
        <Text style={styles.hint}>
          {apiBaseUrlSource === 'user'
            ? tr('settings.api_url_source_user')
            : `${tr('settings.api_url_source_default')}: ${defaultApiBaseUrl}`}
        </Text>
      </View>

      {/* Diagnostics */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Voice diagnostics</Text>
          <View style={styles.chipRow}>
            <Pressable onPress={onShareVoiceMetrics} style={styles.smallBtn}>
              <Text style={styles.smallBtnTxt}>Logs</Text>
            </Pressable>
            <Pressable onPress={onShareASREvaluation} style={styles.smallBtn}>
              <Text style={styles.smallBtnTxt}>ASR</Text>
            </Pressable>
            <Pressable onPress={onClearVoiceMetrics} style={styles.smallBtn}>
              <Text style={styles.smallBtnTxt}>Clear</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.diagnosticsBox}>
          <ScrollView nestedScrollEnabled>
            <Text selectable style={styles.diagnosticsText}>
              {voiceMetricsText || asrEvaluationText || 'No voice metrics yet.'}
            </Text>
          </ScrollView>
        </View>
      </View>

      {/* Auth */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{tr('nav.account')}</Text>
          {auth.state === 'signed-in' ? (
            <Pressable onPress={onSignOut} style={styles.smallBtn}>
              <Text style={styles.smallBtnTxt}>{tr('settings.sign_out')}</Text>
            </Pressable>
          ) : (
            <View style={styles.modeSwitch}>
              {(['sign-in', 'sign-up'] as const).map(m => (
                <Pressable
                  key={m}
                  onPress={() => onSetAuthMode(m)}
                  disabled={authSubmitting || auth.state === 'loading'}
                  style={[styles.modeBtn, authMode === m && styles.modeBtnActive, (authSubmitting || auth.state === 'loading') && styles.disabled]}
                >
                  <Text style={[styles.modeBtnTxt, authMode === m && styles.modeBtnTxtActive]}>
                    {m === 'sign-in' ? tr('login.signin') : tr('login.signup')}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        {auth.state === 'signed-in' ? (
          <Text style={styles.hint}>
            {(auth.user?.user_metadata?.display_name as string | undefined)
              ?? (auth.user?.user_metadata?.username as string | undefined)
              ?? auth.user?.email?.replace(/@users\.meteorvoice\.local$/, '')}
          </Text>
        ) : null}
        {auth.state !== 'signed-in' && auth.message ? (
          <Text style={styles.hintError}>{auth.message}</Text>
        ) : null}
        {auth.state !== 'signed-in' && (
          <View style={styles.authForm}>
            <TextInput
              style={styles.input} value={email} onChangeText={onSetEmail}
              autoCapitalize="none" autoCorrect={false} inputMode="email"
              editable={!authSubmitting && auth.state !== 'loading'}
              placeholder={tr('login.account_placeholder')} placeholderTextColor={C.textMuted}
            />
            <TextInput
              style={styles.input} value={password} onChangeText={onSetPassword}
              editable={!authSubmitting && auth.state !== 'loading'}
              secureTextEntry placeholder={tr('login.password')} placeholderTextColor={C.textMuted}
            />
            <Pressable
              onPress={onSubmitAuth}
              disabled={authSubmitting || auth.state === 'loading'}
              style={[styles.saveBtn, (authSubmitting || auth.state === 'loading') && styles.disabled]}
            >
              <Text style={styles.saveBtnTxt}>
                {authSubmitting || auth.state === 'loading' ? tr('login.loading') : authMode === 'sign-in' ? tr('login.signin') : tr('login.signup')}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
      <Text style={styles.appVersion}>MeteorVoice {appVersion}</Text>
    </ScrollView>
    </KeyboardAvoidingView>
  )
}
