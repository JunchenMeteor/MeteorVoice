import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppState,
  Pressable,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from 'react-native'
import {
  createMeteorVoiceApiClient,
  type HistorySession,
  type SessionTurnDto,
} from '@meteorvoice/api-client'
import {
  createPlaybackQueueSnapshot,
  createInitialSnapshot,
  type PlaybackQueueSnapshot,
  type WorkflowSnapshot,
} from '@meteorvoice/session-core'
import {
  accentProfiles,
  getAccentLabel,
  getAccentRegion,
  getDifficultyLabel,
  getScenarioDescription,
  getScenarioLabel,
  getTTSSpeedRouting,
  scenarios,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  t,
  appFeedback,
  type AppFeedbackState,
  type ConversationMessage,
  type ConversationResponse,
  type Locale,
  type VoiceProfile,
} from '@meteorvoice/shared'

import * as SecureStore from 'expo-secure-store'
import { useMobileAuth } from './mobileAuth'
import { useNativeSessionAudio } from './nativeAudio'
import { useNativeSpeech } from './nativeSpeech'
import { getDefaultApiBaseUrl, getDisplayAppVersion } from './mobileConfig'
import { ThemeProvider, useTheme } from './ThemeProvider'
import { SessionScreen } from './screens/SessionScreen'
import { HomeScreen } from './screens/HomeScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { AppFeedbackOverlay } from './components/AppFeedbackOverlay'
import {
  routePresenceForTab,
  type ApiBaseUrlSource,
  type SessionRoutePresence,
  type SessionSttProvider,
  type Tab,
} from './sessionRuntime'

// Hooks extracted from this file
import { useVoiceMetrics, type VoiceMetricsRefs } from './hooks/useVoiceMetrics'
import { useXunfeiStt } from './hooks/useXunfeiStt'
import { usePlaybackQueue } from './hooks/usePlaybackQueue'
import { useSessionWorkflow } from './hooks/useSessionWorkflow'
import { useSttProvider } from './hooks/useSttProvider'
import { usePreferences } from './hooks/usePreferences'
import { useHistory } from './hooks/useHistory'

const defaultApiBaseUrl = getDefaultApiBaseUrl()
const appVersion = getDisplayAppVersion()

const TAB_LABELS: Record<Tab, string> = {
  home: 'nav.home',
  session: 'nav.practice',
  history: 'nav.history',
  settings: 'nav.settings',
}

function TabIcon({ tab, color }: { tab: Tab; color: string }) {
  if (tab === 'home') return (
    <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View style={{ width: 0, height: 0, borderLeftWidth: 9, borderRightWidth: 9, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color, marginBottom: 1 }} />
      <View style={{ width: 12, height: 8, backgroundColor: color, borderRadius: 1 }} />
    </View>
  )
  if (tab === 'session') return (
    <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center', gap: 1 }}>
      <View style={{ width: 8, height: 11, borderRadius: 4, borderWidth: 2, borderColor: color }} />
      <View style={{ width: 12, height: 2, backgroundColor: color, borderRadius: 1 }} />
    </View>
  )
  if (tab === 'history') return (
    <View style={{ width: 18, height: 18, justifyContent: 'center', gap: 3 }}>
      {[0, 1, 2].map(i => <View key={i} style={{ height: 2, backgroundColor: color, borderRadius: 1, width: i === 0 ? 18 : i === 1 ? 14 : 10 }} />)}
    </View>
  )
  return (
    <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: color }} />
      <View style={{ position: 'absolute', width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
        {[0, 45, 90, 135].map(deg => (
          <View key={deg} style={{ position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: color, transform: [{ rotate: `${deg}deg` }, { translateY: -8 }] }} />
        ))}
      </View>
    </View>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  )
}

function AppInner() {
  const { C, setTheme: setThemeLocal } = useTheme()

  // ─── State ───
  const [activeTab, setActiveTab] = useState<Tab>('session')
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl)
  const [apiBaseUrlSource, setApiBaseUrlSource] = useState<ApiBaseUrlSource>('default')
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [correctionHistory, setCorrectionHistory] = useState<ConversationResponse['corrections']>([])
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [playbackQueue, setPlaybackQueue] = useState<PlaybackQueueSnapshot>(() => createPlaybackQueueSnapshot())
  const [status, setStatusState] = useState('session.ready')
  const [locale, setLocaleState] = useState<Locale>('en')

  useEffect(() => {
    SecureStore.getItemAsync('app_locale').then(v => { if (v === 'zh' || v === 'en') setLocaleState(v) })
  }, [])

  useEffect(() => {
    SecureStore.getItemAsync('api_base_url').then(value => {
      const stored = value?.trim()
      if (stored) { setApiBaseUrl(stored); setApiBaseUrlSource('user') }
      else { setApiBaseUrl(defaultApiBaseUrl); setApiBaseUrlSource('default') }
    })
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    void SecureStore.setItemAsync('app_locale', l)
  }, [])

  const [summary, setSummary] = useState<string | null>(null)
  const [busy, setBusyState] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historySessions, setHistorySessions] = useState<HistorySession[]>([])
  const [selectedHistory, setSelectedHistory] = useState<HistorySession | null>(null)
  const [selectedHistoryTurns, setSelectedHistoryTurns] = useState<SessionTurnDto[]>([])
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [scenarioSwitching, setScenarioSwitching] = useState(false)
  const [activeFeedback, setActiveFeedback] = useState<AppFeedbackState | null>(() => appFeedback.getFeedback())
  const [ttsProvider, setTtsProvider] = useState('mock')
  const [availableProviders, setAvailableProviders] = useState<string[]>(['mock'])
  const [sessionSttProvider, setSessionSttProviderState] = useState<SessionSttProvider>('native')
  const [availableSessionSttProviders, setAvailableSessionSttProviders] = useState<SessionSttProvider[]>(['native'])
  const [ttsVoiceId, setTtsVoiceId] = useState<string | null>(null)
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([])
  const [selectedVoiceProfileId, setSelectedVoiceProfileId] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [xunfeiVoices, setXunfeiVoices] = useState<any[]>([])
  const [ttsSpeed, setTtsSpeed] = useState(1)
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot>(() => createInitialSnapshot('mobile-session'))
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [apiSessionId] = useState<string | null>(null)
  const [selectedScenarioKey, setSelectedScenarioKey] = useState('small-talk')
  const [selectedAccentKey, setSelectedAccentKey] = useState('american')

  const ttsSpeedRouting = getTTSSpeedRouting(ttsProvider, ttsSpeed)
  const audio = useNativeSessionAudio(audioUrl, ttsSpeedRouting.playbackRate)
  const auth = useMobileAuth()
  const getAuthHeaders = auth.getAuthHeaders
  const signOut = auth.signOut

  // ─── Refs ───
  const snapshotRef = useRef(snapshot)
  const messagesRef = useRef(messages)
  const statusRef = useRef(status)
  const localeRef = useRef(locale)
  const selectedScenarioKeyRef = useRef(selectedScenarioKey)
  const sessionSttProviderRef = useRef(sessionSttProvider)
  const sessionSttProviderHydratedRef = useRef(false)
  const sessionSttProvidersLoadedRef = useRef(false)
  const startListeningWithProviderRef = useRef<(provider: SessionSttProvider, lang?: string) => Promise<boolean>>(() => Promise.resolve(false))
  const themeInitializedRef = useRef(false)
  const listeningStartMsRef = useRef(0)
  const speechStartListeningRef = useRef<(lang?: string) => Promise<boolean>>(() => Promise.resolve(false))
  const speechCancelListeningRef = useRef<() => void | Promise<void>>(() => undefined)
  const nativeSpeechStartListeningRef = useRef<(lang?: string) => Promise<boolean>>(() => Promise.resolve(false))
  const nativeSpeechCancelListeningRef = useRef<() => void | Promise<void>>(() => undefined)
  const endpointRequestRef = useRef(0)
  const turnRequestRef = useRef(0)
  const sessionGenerationRef = useRef(0)
  const sttStreamIdRef = useRef(0)
  const sttRestartCountRef = useRef(0)
  const sttRestartStartMsRef = useRef(0)
  const sttOperationQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const sessionActiveRef = useRef(false)
  const canListenOnRouteRef = useRef(true)
  const routePresenceRef = useRef<SessionRoutePresence>('inSession')
  const playbackActiveRef = useRef(false)
  const audioPlayingRef = useRef(false)
  const busyRef = useRef(false)
  const sttPrewarmAudioUrlRef = useRef<string | null>(null)
  const playbackStartedRef = useRef(false)
  const playbackEndedAtMsRef = useRef<number | null>(null)
  const pendingNativeTranscriptRef = useRef('')
  const isCorrectionPlayingRef = useRef(false)
  const resumeListeningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyAutoLoadRef = useRef(false)
  const settingsAutoLoadRef = useRef(false)
  const settingsRequestRef = useRef(0)
  const settingsLoadingRef = useRef(false)
  const activeTabRef = useRef(activeTab)
  const listeningTeardownRef = useRef<Promise<void> | null>(null)
  const xunfeiSessionSttRef = useRef<import('./sessionRuntime').XunfeiSessionSttState | null>(null)

  // ─── Derived values ───
  const scenario = scenarios.find(item => item.key === selectedScenarioKey) ?? scenarios[0]
  const accent = accentProfiles.find(item => item.key === selectedAccentKey) ?? accentProfiles[0]
  const providerVoiceProfiles = voiceProfiles.filter(profile => profile.provider === ttsProvider)
  const selectedVoiceProfile = voiceProfiles.find(profile => profile.id === selectedVoiceProfileId)
    ?? providerVoiceProfiles.find(profile => profile.providerVoiceId === ttsVoiceId)
    ?? providerVoiceProfiles.find(profile => profile.status === 'active')
  const sessionAccentName = selectedVoiceProfile?.accentLabel ?? getAccentLabel(accent, locale)
  const sessionAccentRegion = selectedVoiceProfile?.accentRegion ?? getAccentRegion(accent, locale)
  const tr = useCallback((key: string) => t[locale]?.[key] ?? t.en[key] ?? key, [locale])

  // Swappable refs for native speech
  const speech = useNativeSpeech({
    onFinalTranscript: useCallback((_transcript: string) => {}, []), // populated below after hooks
    onListeningEndedWithoutTranscript: useCallback(() => {}, []),
    onMetric: useCallback(() => {}, []),
  })
  useEffect(() => {
    nativeSpeechStartListeningRef.current = speech.startListening
    nativeSpeechCancelListeningRef.current = speech.cancelListening
  }, [speech.cancelListening, speech.startListening])

  // ─── API Client ───
  const handleUnauthorized = useCallback(() => {
    if (auth.state !== 'signed-in') return signOut(null)
    return signOut(tr('settings.auth_expired'))
  }, [auth.state, signOut, tr])

  const api = useMemo(() => createMeteorVoiceApiClient({
    baseUrl: apiBaseUrl.trim(),
    headers: getAuthHeaders,
    onUnauthorized: handleUnauthorized,
  }), [apiBaseUrl, getAuthHeaders, handleUnauthorized])

  const setSettingsLoadingFlag = useCallback((loading: boolean) => {
    settingsLoadingRef.current = loading
    setSettingsLoading(loading)
  }, [setSettingsLoading])

  // ─── Hooks (coordination layer — intentional type bridging) ───
  /* eslint-disable @typescript-eslint/no-explicit-any */

  // 1. VoiceMetrics — logging, status, busy, teardown
  const metricsRefs: VoiceMetricsRefs = {
    snapshotRef, sessionGenerationRef, turnRequestRef, endpointRequestRef,
    activeTabRef, sessionActiveRef, canListenOnRouteRef, busyRef,
    playbackActiveRef, audioPlayingRef, sessionSttProviderRef,
    selectedScenarioKeyRef, statusRef, listeningTeardownRef,
    sttOperationQueueRef, xunfeiSessionSttRef, routePresenceRef,
    resumeListeningTimerRef, listeningStartMsRef,
  }
  const vm = useVoiceMetrics(
    metricsRefs, setStatusState, setBusyState,
    speechCancelListeningRef, speechStartListeningRef,
  )

  // 2. SttProvider — provider management, prewarm, API URL
  const sttProvider = useSttProvider({
    defaultApiBaseUrl,
    api: api as any,
    authState: auth.state,
    sessionSttProvider,
    audio: {
      isPlaying: audio.isPlaying,
      playbackDurationSeconds: audio.playbackDurationSeconds,
      playbackRemainingMs: audio.playbackRemainingMs,
    },
    audioUrl,
    setApiBaseUrl, setApiBaseUrlSource,
    setSessionSttProvider: setSessionSttProviderState,
    setAvailableSessionSttProviders,
    logVoiceMetric: vm.logVoiceMetric,
    sessionSttProviderRef, sessionSttProviderHydratedRef, sessionSttProvidersLoadedRef,
    playbackActiveRef, sttPrewarmAudioUrlRef,
    speechStartListeningRef, speechCancelListeningRef, startListeningWithProviderRef,
    nativeSpeechStartListeningRef,
  })

  // 3. XunfeiStt — Xunfei ASR WebSocket/PCM lifecycle
  const xunfeiStt = useXunfeiStt({
    api: api as any,
    auth: {
      state: auth.state,
      refreshSession: auth.refreshSession,
    },
    availableSessionSttProviders,
    scenarioKey: scenario.key,
    localeRef,
    snapshotRef,
    sessionGenerationRef,
    sessionActiveRef,
    canStartSessionListening: vm.canStartSessionListening,
    enqueueSttOperation: vm.enqueueSttOperation,
    logVoiceMetric: vm.logVoiceMetric,
    setStatus: vm.setStatus,
    handleListeningEndedWithoutTranscript: useCallback(() => {}, []), // populated below
    handleNativeFinalTranscript: useCallback(async (t: string) => {}, []), // populated below
    nativeSpeechStartListeningRef,
    nativeSpeechCancelListeningRef,
    routePresenceRef,
    canListenOnRouteRef,
    playbackActiveRef,
    audioPlayingRef,
    listeningStartMsRef,
    sttStreamIdRef,
    sttRestartCountRef,
    sttRestartStartMsRef,
    sttOperationQueueRef,
  })

  // 4. SessionWorkflow — session lifecycle, turn submission, endpoint
  const sessionWorkflow = useSessionWorkflow({
    api: api as any,
    getAuthHeaders: getAuthHeaders as any,
    handleUnauthorized,
    apiBaseUrl: apiBaseUrl.trim(),
    accent: { name: accent.name, region: accent.region },
    scenario,
    ttsProvider,
    ttsSpeedRouting,
    ttsVoiceId,
    isSessionActive,
    authState: auth.state,
    audio: {
      isPlaying: audio.isPlaying,
      isRecording: audio.isRecording,
      didJustFinish: audio.didJustFinish,
    },
    setSnapshot, setMessages, setCorrectionHistory, setAudioUrl, setPlaybackQueue,
    setIsSessionActive, setStatus: vm.setStatus, setBusy: vm.setBusy, setSummary,
    setActiveTab: setActiveTab as any, setScenarioSwitching, setSelectedScenarioKey,
    snapshotRef, messagesRef, sessionActiveRef, busyRef,
    playbackActiveRef, audioPlayingRef, playbackStartedRef, playbackEndedAtMsRef,
    pendingNativeTranscriptRef, endpointRequestRef, turnRequestRef, sessionGenerationRef,
    sttRestartCountRef, sttRestartStartMsRef, listeningStartMsRef,
    listeningTeardownRef, canListenOnRouteRef, routePresenceRef,
    activeTabRef, selectedScenarioKeyRef, localeRef,
    logVoiceMetric: vm.logVoiceMetric, logUserAction: vm.logUserAction,
    setRoutePresence: vm.setRoutePresence,
    canStartSessionListening: vm.canStartSessionListening,
    cancelListeningForReason: vm.cancelListeningForReason,
    waitForListeningTeardown: vm.waitForListeningTeardown,
    scheduleResumeListening: vm.scheduleResumeListening,
    clearResumeListeningTimer: vm.clearResumeListeningTimer,
    listeningStartupStatus: vm.listeningStartupStatus as any,
    audioStopPlayback: audio.stopPlayback,
    startListeningWithProviderRef,
    speechStartListeningRef,
    nativeSpeechStartListeningRef,
    scenarioSwitching,
    apiSessionId,
    correctionHistory,
    sttPrewarmAudioUrlRef,
  } as any)

  // 5. PlaybackQueue
  usePlaybackQueue({
    audio: {
      isPlaying: audio.isPlaying,
      didJustFinish: audio.didJustFinish,
      isRecording: audio.isRecording,
      playbackDurationSeconds: audio.playbackDurationSeconds,
      playbackRemainingMs: audio.playbackRemainingMs,
    },
    audioUrl, playbackQueue, setPlaybackQueue, setAudioUrl,
    logVoiceMetric: vm.logVoiceMetric, setStatus: vm.setStatus,
    cancelListeningForReason: vm.cancelListeningForReason,
    scheduleResumeListening: vm.scheduleResumeListening,
    clearResumeListeningTimer: vm.clearResumeListeningTimer,
    listeningStartupStatus: vm.listeningStartupStatus as any,
    playbackActiveRef, playbackStartedRef, playbackEndedAtMsRef, audioPlayingRef,
    isCorrectionPlayingRef, sttPrewarmAudioUrlRef, busyRef,
    sessionActiveRef, routePresenceRef, canListenOnRouteRef, sessionGenerationRef,
    speechStartListeningRef,
  } as any)

  // 6. Preferences
  const preferences = usePreferences({
    api: api as any,
    authState: auth.state,
    auth: { getAuthHeaders: auth.getAuthHeaders as any, state: auth.state },
    handleUnauthorized,
    ttsProvider, ttsSpeed, selectedScenarioKey, locale, apiBaseUrl,
    voiceProfiles, sessionSttProvider,
    appliedThemeRef: themeInitializedRef,
    setLocale, setTtsProvider, setAvailableProviders, setTtsSpeed,
    setTtsVoiceId, setVoiceProfiles, setSelectedVoiceProfileId, setXunfeiVoices,
    setSelectedScenarioKey, setSelectedAccentKey, setSettingsMessage,
    setAvailableSessionSttProviders, setSessionSttProvider: setSessionSttProviderState,
    setTheme: setThemeLocal as any,
    sessionSttProviderRef, settingsRequestRef,
    setSettingsLoadingFlag,
    logVoiceMetric: vm.logVoiceMetric,
    tr,
  })

  // 7. History
  const history = useHistory({
    api: api as any,
    getAuthHeaders: getAuthHeaders as any,
    handleUnauthorized,
    apiBaseUrl, authState: auth.state, activeTab, historyLoading,
    setHistoryLoading, setHistoryError, setHistorySessions,
    setSelectedHistory, setSelectedHistoryTurns, historyAutoLoadRef,
    logVoiceMetric: vm.logVoiceMetric, tr,
  })
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // ─── Wire up Swappable Refs ───
  useEffect(() => {
    speechStartListeningRef.current = sessionSttProvider === 'xunfei'
      ? () => xunfeiStt.startXunfeiSessionListening(false).then(() => true)
      : speech.startListening
    speechCancelListeningRef.current = sessionSttProvider === 'xunfei'
      ? xunfeiStt.cancelXunfeiSessionListening
      : speech.cancelListening
    startListeningWithProviderRef.current = (provider, lang) => (
      provider === 'xunfei'
        ? xunfeiStt.startXunfeiSessionListening().then(() => true)
        : speech.startListening(lang)
    )
  }, [
    sessionSttProvider, speech, xunfeiStt.startXunfeiSessionListening,
    xunfeiStt.cancelXunfeiSessionListening,
  ])

  // Sync xunfeiSessionSttRef from hook to App.tsx level ref (for metric logging)
  useEffect(() => {
    xunfeiSessionSttRef.current = xunfeiStt.xunfeiSessionSttRef.current
  })

  useEffect(() => { sessionActiveRef.current = isSessionActive }, [isSessionActive])

  // ─── Ref Sync Effects ───
  useEffect(() => { snapshotRef.current = snapshot }, [snapshot])
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { statusRef.current = status }, [status])
  useEffect(() => { localeRef.current = locale }, [locale])
  useEffect(() => { selectedScenarioKeyRef.current = selectedScenarioKey }, [selectedScenarioKey])
  useEffect(() => { sessionSttProviderRef.current = sessionSttProvider }, [sessionSttProvider])
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  useEffect(() => { busyRef.current = busy }, [busy])

  useEffect(() => {
    SecureStore.getItemAsync('session_stt_provider').then(value => {
      if (value === 'xunfei' || value === 'native') {
        sessionSttProviderRef.current = value
        setSessionSttProviderState(value)
      }
      sessionSttProviderHydratedRef.current = true
    })
  }, [])

  // ─── Tab Selection ───
  const selectTab = useCallback((tab: Tab) => {
    const previousTab = activeTabRef.current
    activeTabRef.current = tab
    vm.logUserAction('tab_tap', { to: tab, from: previousTab })
    vm.logVoiceMetric('tab_change', {
      from: previousTab, to: tab,
      sessionActive: sessionActiveRef.current,
      canListenOnRoute: canListenOnRouteRef.current,
      busy, playbackActive: playbackActiveRef.current,
      audioPlaying: audioPlayingRef.current,
    })
    setActiveTab(tab)
    const nextRoutePresence = routePresenceForTab(tab)
    vm.setRoutePresence(nextRoutePresence, `tab:${tab}`)
    if (nextRoutePresence === 'outSession') {
      playbackEndedAtMsRef.current = null
      vm.clearResumeListeningTimer()
      endpointRequestRef.current += 1
      pendingNativeTranscriptRef.current = ''
      void vm.cancelListeningForReason(`tab:${tab}`)
      if (sessionActiveRef.current) vm.setStatus('session.paused')
      return
    }
    if (vm.canStartSessionListening('tab_session')) {
      // eslint-disable-next-line react-hooks/purity
      listeningStartMsRef.current = Date.now()
      vm.setStatus(vm.listeningStartupStatus())
      void speechStartListeningRef.current('en-US')
    }
  }, [busy, vm, playbackEndedAtMsRef, endpointRequestRef, pendingNativeTranscriptRef,
    sessionActiveRef, listeningStartMsRef, canListenOnRouteRef])

  // ─── App Feedback Effects ───
  useEffect(() => appFeedback.subscribe(setActiveFeedback), [])

  useEffect(() => {
    if (settingsLoading && activeTab === 'settings')
      appFeedback.show({ message: tr('settings.syncing'), variant: 'hud', source: 'settings' })
    else appFeedback.hide('settings')
  }, [activeTab, settingsLoading, tr])

  useEffect(() => {
    if (authSubmitting && activeTab === 'settings')
      appFeedback.show({ message: tr('login.loading'), variant: 'hud', source: 'auth' })
    else appFeedback.hide('auth')
  }, [activeTab, authSubmitting, tr])

  useEffect(() => {
    if (scenarioSwitching)
      appFeedback.show({ message: tr('session.status.switching_session'), variant: 'hud', source: 'session-transition' })
    else appFeedback.hide('session-transition')
  }, [scenarioSwitching, tr])

  // ─── Startup Effects ───
  useEffect(() => {
    const timer = setTimeout(() => { void sttProvider.loadSessionSttProviders() }, 0)
    return () => clearTimeout(timer)
  }, [sttProvider.loadSessionSttProviders])

  useEffect(() => {
    if (auth.state !== 'signed-in') return
    const timer = setTimeout(() => { preferences.loadSettingsDataGroup()() }, 0)
    return () => clearTimeout(timer)
  }, [auth.state, preferences.loadSettingsDataGroup])

  useEffect(() => {
    if (auth.state !== 'signed-in') { settingsAutoLoadRef.current = false; return }
    if (activeTab !== 'settings' || settingsAutoLoadRef.current) return
    settingsAutoLoadRef.current = true
    return preferences.reloadSettingsData()
  }, [activeTab, auth.state, preferences.reloadSettingsData, settingsAutoLoadRef])

  useEffect(() => () => vm.clearResumeListeningTimer(), [vm.clearResumeListeningTimer])

  // ─── AppState Listener ───
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        vm.logVoiceMetric('app_state_inactive', {
          nextState, sessionActive: sessionActiveRef.current, activeTab: activeTabRef.current,
        })
        vm.setRoutePresence('outSession', `app_state:${nextState}`)
        playbackEndedAtMsRef.current = null
        vm.clearResumeListeningTimer()
        endpointRequestRef.current += 1
        pendingNativeTranscriptRef.current = ''
        void vm.cancelListeningForReason(`app_state:${nextState}`)
        if (sessionActiveRef.current) vm.setStatus('session.paused')
        return
      }
      vm.setRoutePresence(routePresenceForTab(activeTabRef.current), 'app_state:active')
      vm.logVoiceMetric('app_state_active', {
        sessionActive: sessionActiveRef.current, activeTab: activeTabRef.current,
        busy, playbackActive: playbackActiveRef.current, audioPlaying: audioPlayingRef.current,
      })
      if (auth.state === 'signed-in') void preferences.loadPreferences()
      if (vm.canStartSessionListening('app_state_active')) {
        listeningStartMsRef.current = Date.now()
        vm.setStatus(vm.listeningStartupStatus())
        void speechStartListeningRef.current('en-US')
      }
    })
    return () => subscription.remove()
  }, [
    auth.state, busy, vm, preferences.loadPreferences,
    playbackEndedAtMsRef, endpointRequestRef, pendingNativeTranscriptRef,
    sessionActiveRef, listeningStartMsRef,
  ])

  // ─── Auth Submit ───
  const submitAuth = useCallback(async () => {
    const normalizedEmail = email.trim()
    if (!normalizedEmail || !password || auth.state === 'loading' || authSubmitting) return
    vm.logUserAction('auth_submit_tap', { mode: authMode, hasEmail: Boolean(normalizedEmail), passwordLength: password.length })
    setAuthSubmitting(true)
    try {
      const success = await auth.submit(authMode, normalizedEmail, password)
      vm.logVoiceMetric('auth_submit_done', { mode: authMode, success })
      if (success) setPassword('')
    } catch (error) {
      vm.logVoiceMetric('auth_submit_error', {
        mode: authMode, message: error instanceof Error ? error.message : 'Auth submit failed',
      })
    } finally {
      setAuthSubmitting(false)
    }
  }, [email, password, auth, authSubmitting, authMode, vm])

  // ─── Render ───
  const styles = makeStyles()

  function renderScreen() {
    switch (activeTab) {
      case 'session':
        return (
          <SessionScreen
            tr={tr}
            snapshot={snapshot} messages={messages}
            corrections={correctionHistory}
            isSessionActive={isSessionActive} status={status} summary={summary} busy={busy}
            scenarioName={getScenarioLabel(scenario, locale)} scenarioIcon={scenario.icon}
            scenarioDifficulty={getDifficultyLabel(scenario.difficulty, locale)}
            scenarioDescription={getScenarioDescription(scenario, locale)}
            accentName={sessionAccentName} accentRegion={sessionAccentRegion}
            onStart={async () => {
              const provider = await sttProvider.ensureSessionSttProviderForStart()
              return sessionWorkflow.startSession(provider)
            }}
            onEnd={() => void sessionWorkflow.endSession()}
            onPlayCorrection={sessionWorkflow.playCorrection}
            onSubmitText={text => {
              vm.logUserAction('manual_text_submit', { chars: text.trim().length })
              void sessionWorkflow.submitTurn(text)
            }}
          />
        )
      case 'home':
        return (
          <HomeScreen
            tr={tr} locale={locale} scenarios={scenarios}
            selectedScenarioKey={selectedScenarioKey}
            isSessionActive={isSessionActive} scenarioSwitching={scenarioSwitching}
            onSelectScenario={key => { void sessionWorkflow.selectScenario(key); return true }}
            onGoToSession={() => selectTab('session')}
          />
        )
      case 'history':
        return (
          <HistoryScreen
            tr={tr} locale={locale}
            sessions={historySessions} loading={historyLoading} error={historyError}
            selectedHistory={selectedHistory} selectedTurns={selectedHistoryTurns}
            onLoad={() => void history.loadHistory()}
            onSelect={item => { void history.selectHistorySession(item) }}
            onDelete={id => { void history.deleteSession(id) }}
          />
        )
      case 'settings':
        return (
          <SettingsScreen
            tr={tr} locale={locale}
            ttsProvider={ttsProvider} availableProviders={availableProviders}
            sessionSttProvider={sessionSttProvider} availableSessionSttProviders={availableSessionSttProviders}
            ttsSpeed={ttsSpeed} ttsVoiceId={ttsVoiceId}
            voiceProfiles={voiceProfiles} selectedVoiceProfileId={selectedVoiceProfileId}
            xunfeiVoices={xunfeiVoices}
            settingsLoading={settingsLoading} authSubmitting={authSubmitting}
            settingsMessage={settingsMessage}
            auth={auth} email={email} password={password} authMode={authMode}
            apiBaseUrl={apiBaseUrl} apiBaseUrlSource={apiBaseUrlSource}
            defaultApiBaseUrl={defaultApiBaseUrl} appVersion={appVersion}
            voiceMetricsText={vm.voiceMetricsText} asrEvaluationText={vm.asrEvaluationText}
            onSetLocale={localeValue => {
              vm.logUserAction('settings_locale_tap', { locale: localeValue })
              void preferences.saveLocalePreference(localeValue as Locale)
            }}
            onSetTheme={key => {
              vm.logUserAction('settings_theme_tap', { theme: key })
              themeInitializedRef.current = true
              setThemeLocal(key)
              const now = new Date().toISOString()
              void SecureStore.setItemAsync('theme_set_at', now)
              void api.updatePreferences({ ui_theme: key }).catch(() => {})
            }}
            onSaveProvider={provider => {
              vm.logUserAction('settings_tts_provider_tap', { provider })
              void preferences.saveProvider(provider)
            }}
            onSetSessionSttProvider={provider => {
              vm.logUserAction('settings_stt_provider_tap', { provider })
              sttProvider.setSessionSttProviderFn(provider)
            }}
            onAdjustSpeed={delta => {
              vm.logUserAction('settings_tts_speed_tap', { delta })
              preferences.adjustSpeed(delta)
            }}
            onSavePracticePreferences={() => {
              vm.logUserAction('settings_save_preferences_tap')
              void preferences.savePracticePreferences()
            }}
            onLoadPreferences={() => {
              vm.logUserAction('settings_reload_tap')
              preferences.loadSettingsDataGroup()
            }}
            onSelectVoiceProfile={profile => {
              vm.logUserAction('settings_voice_profile_tap', { profileId: profile.id, provider: profile.provider })
              void preferences.selectVoiceProfile(profile)
            }}
            onSetEmail={setEmail}
            onSetPassword={setPassword}
            onSetAuthMode={mode => {
              vm.logUserAction('auth_mode_tap', { mode })
              setAuthMode(mode)
            }}
            onSubmitAuth={() => void submitAuth()}
            onSignOut={() => {
              vm.logUserAction('auth_sign_out_tap')
              void auth.signOut()
            }}
            onSetApiBaseUrl={value => {
              vm.logUserAction('settings_api_base_url_edit', { hasValue: Boolean(value.trim()) })
              sttProvider.updateApiBaseUrl(value)
            }}
            onResetApiBaseUrl={() => {
              vm.logUserAction('settings_api_base_url_reset_tap')
              sttProvider.resetApiBaseUrl()
            }}
            onClearVoiceMetrics={() => {
              vm.logUserAction('diagnostics_clear_tap')
              // voiceMetrics state is internal to useVoiceMetrics hook
            }}
            onShareVoiceMetrics={() => {
              vm.logUserAction('diagnostics_share_tap')
              void Share.share({ title: 'MeteorVoice voice diagnostics', message: vm.voiceMetricsText || 'No voice metrics yet.' })
            }}
            onShareASREvaluation={() => {
              vm.logUserAction('diagnostics_asr_share_tap')
              void Share.share({ title: 'MeteorVoice ASR evaluation', message: vm.asrEvaluationText })
            }}
          />
        )
    }
  }

  function makeStyles() {
    return StyleSheet.create({
      shell: { flex: 1, backgroundColor: C.bg },
      content: { flex: 1 },
      tabBarWrapper: { paddingHorizontal: 16, paddingBottom: 8, paddingTop: 6, backgroundColor: C.bg },
      tabBar: {
        flexDirection: 'row',
        backgroundColor: C.surface,
        borderRadius: 24, borderWidth: 1, borderColor: C.border,
        paddingVertical: 4, paddingHorizontal: 4,
      },
      tabItem: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2, borderRadius: 20 },
      tabItemActive: { backgroundColor: C.accent },
      tabLabel: { fontSize: 10, color: C.textMuted, fontWeight: '600' },
      tabLabelActive: { color: C.cream },
    })
  }

  return (
    <SafeAreaView style={styles.shell}>
      <View style={styles.content}>
        {renderScreen()}
        <AppFeedbackOverlay feedback={activeFeedback} />
      </View>
      <View style={styles.tabBarWrapper}>
        <View style={styles.tabBar}>
          {(['home', 'session', 'history', 'settings'] as Tab[]).map(tab => (
            <Pressable key={tab} onPress={() => selectTab(tab)} style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}>
              <TabIcon tab={tab} color={activeTab === tab ? C.cream : C.textMuted} />
              <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
                {tr(TAB_LABELS[tab])}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  )
}
