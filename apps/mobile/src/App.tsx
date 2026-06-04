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
  formatApiRequestError,
  type CreateASRSessionResponse,
  type HistorySession,
  type PreferencesResponse,
  type SessionTurnDto,
} from '@meteorvoice/api-client'
import {
  acceptTranscriptTurn,
  advancePlaybackQueue,
  canAcceptUserTranscript,
  canEndSession,
  createPlaybackQueueSnapshot,
  createInitialSnapshot,
  DEFAULT_PLAYBACK_COOLDOWN_MS,
  endActiveSession,
  gateUserTranscript,
  getPlaybackCompletionEffects,
  judgeEndpoint,
  receiveCoachReply,
  recoverSessionError,
  requestCoachReply,
  completeCoachPlayback,
  shouldIgnoreLikelyPlaybackEcho,
  startListeningSession,
  startPlaybackQueue,
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
  runAppOperationGroup,
  scenarios,
  t,
  appFeedback,
  displayErrorFeedback,
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
import { syncMobilePreferences, type XunfeiVoice } from './mobilePreferences'
import { getDefaultApiBaseUrl, getDisplayAppVersion } from './mobileConfig'
import {
  addPcmFrameListener,
  addPcmStateListener,
  isPcmCaptureAvailable,
  startPcmCapture,
  stopPcmCapture,
  type PcmCaptureFrameEvent,
} from './voicePcmCapture'
import { ThemeProvider, useTheme } from './ThemeProvider'
import { SessionScreen } from './screens/SessionScreen'
import { HomeScreen } from './screens/HomeScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { AppFeedbackOverlay } from './components/AppFeedbackOverlay'

const defaultApiBaseUrl = getDefaultApiBaseUrl()
const appVersion = getDisplayAppVersion()
const apiBaseUrlStorageKey = 'api_base_url'
const sessionSttProviderStorageKey = 'session_stt_provider'
type Tab = 'session' | 'home' | 'history' | 'settings'
type ApiBaseUrlSource = 'default' | 'user'
type SessionSttProvider = 'native' | 'xunfei'
type VoiceMetricEntry = {
  ts: number
  stage: string
  data: Record<string, unknown>
}

type ASREvaluationRun = {
  startedAt?: number
  firstPartialMs?: number | null
  finalMs?: number | null
  chars?: number
  source?: string
  frameCount?: number
  totalBytes?: number
  error?: string
}

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

function createASREvaluationReport(entries: VoiceMetricEntry[]) {
  const nativeRuns: ASREvaluationRun[] = []
  const remoteRuns: ASREvaluationRun[] = []
  let currentNative: ASREvaluationRun | null = null
  let currentRemote: ASREvaluationRun | null = null

  for (const entry of entries) {
    if (entry.stage === 'stt_start') {
      currentNative = { startedAt: entry.ts }
      nativeRuns.push(currentNative)
    } else if (entry.stage === 'stt_first_partial' && currentNative) {
      currentNative.firstPartialMs = readMetricNumber(entry.data.elapsedMs)
      currentNative.chars = readMetricNumber(entry.data.chars) ?? currentNative.chars
    } else if (entry.stage === 'stt_submit' && currentNative) {
      currentNative.finalMs = readMetricNumber(entry.data.elapsedMs)
      currentNative.chars = readMetricNumber(entry.data.chars) ?? currentNative.chars
      currentNative.source = typeof entry.data.source === 'string' ? entry.data.source : undefined
    } else if (entry.stage === 'stt_end' && currentNative && currentNative.finalMs == null) {
      currentNative.finalMs = readMetricNumber(entry.data.elapsedMs)
    }

    if (entry.stage === 'asr_stream_start') {
      currentRemote = { startedAt: entry.ts }
      remoteRuns.push(currentRemote)
    } else if (entry.stage === 'asr_first_partial' && currentRemote) {
      currentRemote.firstPartialMs = readMetricNumber(entry.data.elapsedMs)
      currentRemote.chars = readMetricNumber(entry.data.chars) ?? currentRemote.chars
    } else if (entry.stage === 'asr_stream_done' && currentRemote) {
      currentRemote.finalMs = readMetricNumber(entry.data.streamElapsedMs) ?? readMetricNumber(entry.data.elapsedMs)
      currentRemote.chars = readMetricNumber(entry.data.transcriptChars) ?? currentRemote.chars
      currentRemote.frameCount = readMetricNumber(entry.data.frameCount) ?? undefined
      currentRemote.totalBytes = readMetricNumber(entry.data.totalBytes) ?? undefined
    } else if (entry.stage === 'asr_stream_provider_error' && currentRemote) {
      currentRemote.error = typeof entry.data.message === 'string' ? entry.data.message : 'Provider error'
    } else if (entry.stage === 'asr_diagnostic_error' && currentRemote) {
      currentRemote.error = typeof entry.data.message === 'string' ? entry.data.message : 'Diagnostic error'
    }
  }

  const latestNative = nativeRuns.at(-1)
  const latestRemote = remoteRuns.at(-1)
  return [
    'ASR P4 evaluation report',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Native runs: ${nativeRuns.length}`,
    formatASRRun('Latest native', latestNative),
    '',
    `Remote Xunfei runs: ${remoteRuns.length}`,
    formatASRRun('Latest remote', latestRemote),
    '',
    'Acceptance checks:',
    '- Compare first partial latency between native and remote.',
    '- Compare final latency between native and remote.',
    '- Compare transcript chars and exported raw metrics against the spoken script.',
    '- Do not switch production STT until remote accuracy and latency are better on device.',
  ].join('\n')
}

function formatASRRun(label: string, run: ASREvaluationRun | undefined) {
  if (!run) return `${label}: no run captured`
  return [
    `${label}:`,
    `  startedAt: ${run.startedAt ? new Date(run.startedAt).toLocaleString() : 'unknown'}`,
    `  firstPartialMs: ${formatMetricValue(run.firstPartialMs)}`,
    `  finalMs: ${formatMetricValue(run.finalMs)}`,
    `  chars: ${formatMetricValue(run.chars)}`,
    run.source ? `  source: ${run.source}` : null,
    run.frameCount != null ? `  frameCount: ${run.frameCount}` : null,
    run.totalBytes != null ? `  totalBytes: ${run.totalBytes}` : null,
    run.error ? `  error: ${run.error}` : null,
  ].filter(Boolean).join('\n')
}

function readMetricNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatMetricValue(value: number | null | undefined) {
  return value == null ? 'n/a' : String(value)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise
      .then(resolve, reject)
      .finally(() => clearTimeout(timer))
  })
}

function createXunfeiASRFrame(session: CreateASRSessionResponse, status: 0 | 1 | 2, audioBase64: string, sequence: number) {
  const providerConfig = session.providerConfig
  const header = {
    app_id: providerConfig?.appId,
    status,
  }
  const audio = {
    encoding: providerConfig?.audioEncoding ?? 'raw',
    sample_rate: providerConfig?.sampleRate ?? 16000,
    channels: providerConfig?.channels ?? 1,
    bit_depth: providerConfig?.bitDepth ?? 16,
    seq: sequence,
    status,
    audio: audioBase64,
  }
  if (status !== 0) {
    return {
      header,
      payload: { audio },
    }
  }

  return {
    header,
    parameter: {
      iat: {
        domain: providerConfig?.domain ?? 'slm',
        language: providerConfig?.language ?? 'zh_cn',
        accent: providerConfig?.accent ?? 'mandarin',
        eos: providerConfig?.eosMs ?? 900,
        dwa: 'wpgs',
        result: {
          encoding: 'utf8',
          compress: 'raw',
          format: 'json',
        },
      },
    },
    payload: { audio },
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function extractXunfeiRecognitionResult(payload: Record<string, unknown> | null) {
  const payloadObject = getObject(payload?.payload)
  const payloadResult = getObject(payloadObject?.result)
  const encodedText = typeof payloadResult?.text === 'string' ? payloadResult.text : null
  if (encodedText) {
    const decoded = decodeBase64Utf8(encodedText)
    const decodedPayload = parseJsonObject(decoded)
    const decodedWords = extractXunfeiWords(decodedPayload?.ws)
    if (decodedWords) {
      const rg = Array.isArray(decodedPayload?.rg) &&
        typeof decodedPayload.rg[0] === 'number' &&
        typeof decodedPayload.rg[1] === 'number'
        ? [decodedPayload.rg[0], decodedPayload.rg[1]] as [number, number]
        : null
      return {
        text: decodedWords,
        sn: typeof decodedPayload?.sn === 'number' ? decodedPayload.sn : null,
        pgs: typeof decodedPayload?.pgs === 'string' ? decodedPayload.pgs : null,
        rg,
      }
    }
  }

  const data = getObject(payload?.data)
  const result = getObject(data?.result)
  const fallbackWords = extractXunfeiWords(result?.ws)
  return fallbackWords
    ? { text: fallbackWords, sn: null, pgs: null, rg: null }
    : null
}

function extractXunfeiWords(words: unknown) {
  if (!Array.isArray(words)) return ''
  return words.map(item => {
    const word = getObject(item)
    const candidates = word?.cw
    if (!Array.isArray(candidates)) return ''
    return candidates.map(candidate => {
      const candidateObject = getObject(candidate)
      return typeof candidateObject?.w === 'string' ? candidateObject.w : ''
    }).join('')
  }).join('')
}

function decodeBase64Utf8(value: string) {
  try {
    const decoder = globalThis.atob
    if (!decoder) return ''
    const binary = decoder(value)
    const escaped = Array.from(binary)
      .map(char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('')
    return decodeURIComponent(escaped)
  } catch {
    return ''
  }
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
  const [activeTab, setActiveTab] = useState<Tab>('session')
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl)
  const [apiBaseUrlSource, setApiBaseUrlSource] = useState<ApiBaseUrlSource>('default')
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [correctionHistory, setCorrectionHistory] = useState<ConversationResponse['corrections']>([])
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [playbackQueue, setPlaybackQueue] = useState<PlaybackQueueSnapshot>(() => createPlaybackQueueSnapshot())
  const [status, setStatus] = useState('session.ready')
  const [locale, setLocaleState] = useState<Locale>('en')
  useEffect(() => {
    SecureStore.getItemAsync('app_locale').then(v => { if (v === 'zh' || v === 'en') setLocaleState(v) })
  }, [])
  useEffect(() => {
    SecureStore.getItemAsync(apiBaseUrlStorageKey).then(value => {
      const stored = value?.trim()
      if (stored) {
        setApiBaseUrl(stored)
        setApiBaseUrlSource('user')
      } else {
        setApiBaseUrl(defaultApiBaseUrl)
        setApiBaseUrlSource('default')
      }
    })
  }, [])
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    void SecureStore.setItemAsync('app_locale', l)
  }, [])
  const [summary, setSummary] = useState<string | null>(null)
  const [voiceMetrics, setVoiceMetrics] = useState<VoiceMetricEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historySessions, setHistorySessions] = useState<HistorySession[]>([])
  const [selectedHistory, setSelectedHistory] = useState<HistorySession | null>(null)
  const [selectedHistoryTurns, setSelectedHistoryTurns] = useState<SessionTurnDto[]>([])
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null)
  const [activeFeedback, setActiveFeedback] = useState<AppFeedbackState | null>(() => appFeedback.getFeedback())
  const [ttsProvider, setTtsProvider] = useState('mock')
  const [availableProviders, setAvailableProviders] = useState<string[]>(['mock'])
  const [sessionSttProvider, setSessionSttProviderState] = useState<SessionSttProvider>('native')
  const [availableSessionSttProviders, setAvailableSessionSttProviders] = useState<SessionSttProvider[]>(['native'])
  const [ttsVoiceId, setTtsVoiceId] = useState<string | null>(null)
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([])
  const [selectedVoiceProfileId, setSelectedVoiceProfileId] = useState<string | null>(null)
  const [xunfeiVoices, setXunfeiVoices] = useState<XunfeiVoice[]>([])
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
  const snapshotRef = useRef(snapshot)
  const messagesRef = useRef(messages)
  const localeRef = useRef(locale)
  const sessionSttProviderRef = useRef(sessionSttProvider)
  const sessionSttProviderHydratedRef = useRef(false)
  const sessionSttProvidersLoadedRef = useRef(false)
  const startListeningWithProviderRef = useRef<(provider: SessionSttProvider, lang?: string) => Promise<boolean>>(() => Promise.resolve(false))
  const prefSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const themeInitializedRef = useRef(false)
  const listeningStartMsRef = useRef(0)
  const speechStartListeningRef = useRef<(lang?: string) => Promise<boolean>>(() => Promise.resolve(false))
  const speechCancelListeningRef = useRef<() => void | Promise<void>>(() => undefined)
  const nativeSpeechStartListeningRef = useRef<(lang?: string) => Promise<boolean>>(() => Promise.resolve(false))
  const nativeSpeechCancelListeningRef = useRef<() => void | Promise<void>>(() => undefined)
  const xunfeiSessionSttRef = useRef<{
    socket: WebSocket | null
    frameSubscription: { remove: () => void } | null
    stateSubscription: { remove: () => void } | null
    finalizeTimer: ReturnType<typeof setTimeout> | null
    hardTimer: ReturnType<typeof setTimeout> | null
    noFrameTimer: ReturnType<typeof setTimeout> | null
    settled: boolean
  } | null>(null)
  const endpointRequestRef = useRef(0)
  const turnRequestRef = useRef(0)
  const sessionActiveRef = useRef(false)
  const canListenOnRouteRef = useRef(true)
  const playbackActiveRef = useRef(false)
  const audioPlayingRef = useRef(false)
  const playbackStartedRef = useRef(false)
  const playbackEndedAtMsRef = useRef<number | null>(null)
  const pendingNativeTranscriptRef = useRef('')
  const isCorrectionPlayingRef = useRef(false)
  const resumeListeningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyAutoLoadRef = useRef(false)
  const settingsAutoLoadRef = useRef(false)
  const settingsRequestRef = useRef(0)
  const settingsLoadingRef = useRef(false)

  const scenario = scenarios.find(item => item.key === selectedScenarioKey) ?? scenarios[0]
  const accent = accentProfiles.find(item => item.key === selectedAccentKey) ?? accentProfiles[0]
  const providerVoiceProfiles = voiceProfiles.filter(profile => profile.provider === ttsProvider)
  const selectedVoiceProfile = voiceProfiles.find(profile => profile.id === selectedVoiceProfileId)
    ?? providerVoiceProfiles.find(profile => profile.providerVoiceId === ttsVoiceId)
    ?? providerVoiceProfiles.find(profile => profile.status === 'active')
  const sessionAccentName = selectedVoiceProfile?.accentLabel ?? getAccentLabel(accent, locale)
  const sessionAccentRegion = selectedVoiceProfile?.accentRegion ?? getAccentRegion(accent, locale)
  const tr = useCallback((key: string) => t[locale]?.[key] ?? t.en[key] ?? key, [locale])

  useEffect(() => {
    SecureStore.getItemAsync(sessionSttProviderStorageKey).then(value => {
      if (value === 'xunfei' || value === 'native') {
        sessionSttProviderRef.current = value
        setSessionSttProviderState(value)
      }
      sessionSttProviderHydratedRef.current = true
    })
  }, [])

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    localeRef.current = locale
  }, [locale])

  useEffect(() => {
    sessionSttProviderRef.current = sessionSttProvider
  }, [sessionSttProvider])

  const listeningStartupStatus = useCallback((provider = sessionSttProviderRef.current) => (
    provider === 'xunfei'
      ? 'session.status.preparing_listening'
      : 'session.status.listening'
  ), [])
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
  }, [])
  const applyThemeLocal = useCallback((k: Parameters<typeof setThemeLocal>[0]) => {
    setThemeLocal(k)
  }, [setThemeLocal])
  const setTheme = useCallback((k: Parameters<typeof setThemeLocal>[0]) => {
    themeInitializedRef.current = true
    setThemeLocal(k)
    const now = new Date().toISOString()
    void SecureStore.setItemAsync('theme_set_at', now)
    void api.updatePreferences({ ui_theme: k }).catch(() => {})
  }, [setThemeLocal, api])
  const clearResumeListeningTimer = useCallback(() => {
    if (!resumeListeningTimerRef.current) return
    clearTimeout(resumeListeningTimerRef.current)
    resumeListeningTimerRef.current = null
  }, [])

  const logVoiceMetric = useCallback((stage: string, data: Record<string, unknown> = {}) => {
    const sanitizedData = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        key.toLowerCase().includes('audiourl') && typeof value === 'string' ? '<audioUrl>' : value,
      ]),
    )
    const entry = { ts: Date.now(), stage, data: sanitizedData }
    console.info('[voice-metrics]', JSON.stringify(entry))
    setVoiceMetrics(previous => [...previous.slice(-79), entry])
  }, [])

  const voiceMetricsText = useMemo(() => {
    return voiceMetrics
      .map(entry => `${new Date(entry.ts).toLocaleTimeString()} ${entry.stage} ${JSON.stringify(entry.data)}`)
      .join('\n')
  }, [voiceMetrics])
  const asrEvaluationText = useMemo(() => createASREvaluationReport(voiceMetrics), [voiceMetrics])

  const scheduleResumeListening = useCallback((delayMs = DEFAULT_PLAYBACK_COOLDOWN_MS, updateStatus = true) => {
    clearResumeListeningTimer()
    resumeListeningTimerRef.current = setTimeout(() => {
      resumeListeningTimerRef.current = null
      if (!sessionActiveRef.current || !canListenOnRouteRef.current || playbackActiveRef.current || audioPlayingRef.current) {
        logVoiceMetric('resume_listening_skipped', {
          playbackActive: playbackActiveRef.current,
          audioPlaying: audioPlayingRef.current,
        })
        return
      }
      listeningStartMsRef.current = Date.now()
      if (updateStatus) setStatus(listeningStartupStatus())
      void speechStartListeningRef.current('en-US')
    }, delayMs)
  }, [clearResumeListeningTimer, listeningStartupStatus, logVoiceMetric])

  useEffect(() => clearResumeListeningTimer, [clearResumeListeningTimer])

  const updateApiBaseUrl = useCallback((value: string) => {
    setApiBaseUrl(value)
    const normalized = value.trim()
    if (!normalized || normalized === defaultApiBaseUrl) {
      setApiBaseUrlSource('default')
      void SecureStore.deleteItemAsync(apiBaseUrlStorageKey)
      return
    }
    setApiBaseUrlSource('user')
    void SecureStore.setItemAsync(apiBaseUrlStorageKey, normalized)
  }, [])

  const resetApiBaseUrl = useCallback(() => {
    setApiBaseUrl(defaultApiBaseUrl)
    setApiBaseUrlSource('default')
    void SecureStore.deleteItemAsync(apiBaseUrlStorageKey)
  }, [])

  const setSessionSttProvider = useCallback((provider: SessionSttProvider) => {
    sessionSttProviderRef.current = provider
    setSessionSttProviderState(provider)
    void SecureStore.setItemAsync(sessionSttProviderStorageKey, provider)
    logVoiceMetric('stt_provider_selected', { provider })
  }, [logVoiceMetric, setSessionSttProviderState])

  async function ensureSessionSttProviderForStart() {
    let provider = sessionSttProviderRef.current

    if (!sessionSttProviderHydratedRef.current) {
      const stored = await SecureStore.getItemAsync(sessionSttProviderStorageKey)
      if (stored === 'xunfei' || stored === 'native') {
        provider = stored
        sessionSttProviderRef.current = stored
        setSessionSttProviderState(stored)
      }
      sessionSttProviderHydratedRef.current = true
    }

    if (auth.state === 'signed-in' && !sessionSttProvidersLoadedRef.current) {
      try {
        const result = await api.listASRProviders()
        const providers: SessionSttProvider[] = ['native']
        if (result.providers.some(item => item.key === 'xunfei' && item.enabled)) {
          providers.push('xunfei')
        }
        setAvailableSessionSttProviders(providers)
        sessionSttProvidersLoadedRef.current = true
        if (!providers.includes(provider)) {
          provider = 'native'
          sessionSttProviderRef.current = 'native'
          setSessionSttProviderState('native')
          void SecureStore.setItemAsync(sessionSttProviderStorageKey, 'native')
        }
      } catch (error) {
        const requestError = formatApiRequestError(error, {
          context: 'mobile_asr_providers_load',
          presentation: 'silent',
        })
        logVoiceMetric('mobile_silent_request_error', requestError.logData)
      }
    }

    return provider
  }

  async function startSession() {
    if (auth.state !== 'signed-in') {
      setActiveTab('settings')
      setStatus('login.signin')
      return
    }

    setStatus('session.status.preparing_listening')
    const listeningProvider = await ensureSessionSttProviderForStart()
    logVoiceMetric('session_start', {
      scenario: scenario.key,
      accent: accent.key,
      provider: ttsProvider,
      sttProvider: listeningProvider,
    })
    endpointRequestRef.current += 1
    clearResumeListeningTimer()
    playbackActiveRef.current = false
    playbackStartedRef.current = false
    playbackEndedAtMsRef.current = null
    listeningStartMsRef.current = Date.now()
    pendingNativeTranscriptRef.current = ''
    sessionActiveRef.current = true
    canListenOnRouteRef.current = true
    const nextSessionId = apiSessionId ?? `mobile-${Date.now()}`
    const nextSnapshot = startListeningSession(nextSessionId)
    snapshotRef.current = nextSnapshot
    messagesRef.current = []
    setSnapshot(nextSnapshot)
    setMessages([])
    setCorrectionHistory([])
    setAudioUrl(null)
    playbackEndedAtMsRef.current = null
    setPlaybackQueue(createPlaybackQueueSnapshot())
    setSummary(null)
    setIsSessionActive(true)
    setStatus(listeningStartupStatus(listeningProvider))
    void startListeningWithProviderRef.current(listeningProvider, 'en-US')
  }

  const synthesizeCoachSpeech = useCallback(async (text: string) => {
    return api.synthesizeSpeech({
      text,
      accent: accent.name,
      provider: ttsProvider,
      speed: ttsSpeedRouting.serverSpeed,
      voiceId: ttsVoiceId ?? undefined,
    })
  }, [accent.name, api, ttsProvider, ttsSpeedRouting.serverSpeed, ttsVoiceId])

  useEffect(() => {
    audioPlayingRef.current = audio.isPlaying
    if (audio.isPlaying && audioUrl && playbackActiveRef.current && !playbackStartedRef.current) {
      playbackStartedRef.current = true
      logVoiceMetric('playback_started', { audioUrl })
      void speechCancelListeningRef.current()
    }
  }, [audio.isPlaying, audioUrl, logVoiceMetric])

  useEffect(() => {
    if (!audioUrl || !audio.didJustFinish || audio.isPlaying) return
    if (!playbackStartedRef.current) {
      logVoiceMetric('playback_finish_ignored', { reason: 'not_started', audioUrl })
      return
    }

    let cancelled = false
    const advanceQueue = () => {
      if (cancelled) return

      if (isCorrectionPlayingRef.current) {
        isCorrectionPlayingRef.current = false
        playbackActiveRef.current = false
        playbackStartedRef.current = false
        playbackEndedAtMsRef.current = Date.now()
        setStatus(sessionActiveRef.current && canListenOnRouteRef.current
          ? 'session.status.listening'
          : 'session.status.reply_played')
        if (sessionActiveRef.current && canListenOnRouteRef.current) {
          scheduleResumeListening(900, false)
        }
        return
      }

      const nextQueue = advancePlaybackQueue({
        queue: playbackQueue,
        finishedAudioUrl: audioUrl,
        didJustFinish: audio.didJustFinish,
        isPlaying: audio.isPlaying,
      })

      if (nextQueue === playbackQueue) return

      setPlaybackQueue(nextQueue)
      const effects = getPlaybackCompletionEffects(nextQueue)
      if (effects.includes('play_next_audio') && nextQueue.currentAudioUrl && nextQueue.currentAudioUrl !== audioUrl) {
        playbackActiveRef.current = true
        playbackStartedRef.current = false
        playbackEndedAtMsRef.current = null
        clearResumeListeningTimer()
        void speechCancelListeningRef.current()
        setStatus('session.status.playing_reply')
        setAudioUrl(nextQueue.currentAudioUrl)
        return
      }

      playbackActiveRef.current = false
      playbackStartedRef.current = false
      playbackEndedAtMsRef.current = Date.now()
      logVoiceMetric('playback_finished', { audioUrl })
      setStatus('session.status.reply_played')
      if (sessionActiveRef.current && canListenOnRouteRef.current) {
        scheduleResumeListening()
      }
    }

    const timeout = setTimeout(advanceQueue, 0)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [audio.didJustFinish, audio.isPlaying, audioUrl, playbackQueue, clearResumeListeningTimer, logVoiceMetric, scheduleResumeListening])

  const submitTurn = useCallback(async (sourceTranscript: string) => {
    const submitStartedAt = Date.now()
    const transcript = sourceTranscript.trim()
    const currentSnapshot = snapshotRef.current
    const currentMessages = messagesRef.current
    if (
      busy ||
      audio.isRecording ||
      playbackActiveRef.current ||
      !canAcceptUserTranscript({
        activeSession: isSessionActive,
        canListenOnRoute: canListenOnRouteRef.current,
        workflowState: currentSnapshot.state,
        transcript,
      })
    ) return

    const acceptedTurn = acceptTranscriptTurn({ snapshot: currentSnapshot, transcript, messages: currentMessages })
    const nextMessages = acceptedTurn.messages
    let nextSnapshot = acceptedTurn.snapshot
    snapshotRef.current = nextSnapshot
    messagesRef.current = nextMessages
    setSnapshot(nextSnapshot)
    setMessages(nextMessages)
    setAudioUrl(null)
    setPlaybackQueue(createPlaybackQueueSnapshot())
    listeningStartMsRef.current = 0
    playbackEndedAtMsRef.current = null
    pendingNativeTranscriptRef.current = ''
    clearResumeListeningTimer()
    await speechCancelListeningRef.current()
    setBusy(true)
    const turnRequestId = ++turnRequestRef.current

    try {
      setStatus('session.status.requesting_reply')
      nextSnapshot = requestCoachReply(nextSnapshot)
      snapshotRef.current = nextSnapshot
      setSnapshot(nextSnapshot)
      const coachReply = await withTimeout(api.generateCoachReply({
        messages: nextMessages,
        context: {
          scenario: { name: scenario.name, description: scenario.description },
          accentProfile: { name: accent.name, region: accent.region },
          sessionId: nextSnapshot.sessionId,
          turnNumber: nextMessages.filter(message => message.role === 'user').length,
          responseLocale: localeRef.current,
        },
      }), 20_000, 'Coach reply request timed out.')
      if (turnRequestRef.current !== turnRequestId || !sessionActiveRef.current) {
        logVoiceMetric('coach_reply_ignored', { reason: 'session_inactive' })
        return
      }
      logVoiceMetric('coach_reply_ready', {
        elapsedMs: Date.now() - submitStartedAt,
        chars: coachReply.text.length,
      })
      setCorrectionHistory(previous => [...previous, ...coachReply.corrections])
      const coachTurn = receiveCoachReply({
        snapshot: nextSnapshot,
        messages: nextMessages,
        responseText: coachReply.text,
        corrections: coachReply.corrections,
      })
      nextSnapshot = coachTurn.snapshot
      snapshotRef.current = nextSnapshot
      messagesRef.current = coachTurn.messages
      setMessages(coachTurn.messages)
      setSnapshot(nextSnapshot)

      setStatus('session.status.requesting_voice')
      if (!coachReply.text.trim()) {
        setStatus('session.status.reply_without_text')
        if (sessionActiveRef.current && canListenOnRouteRef.current) {
          scheduleResumeListening(500)
        }
        return
      }
      const voice = await withTimeout(synthesizeCoachSpeech(coachReply.text), 20_000, 'Coach voice request timed out.')
      if (turnRequestRef.current !== turnRequestId || !sessionActiveRef.current) {
        logVoiceMetric('tts_ignored', { reason: 'session_inactive' })
        return
      }
      logVoiceMetric('tts_ready', {
        elapsedMs: Date.now() - submitStartedAt,
        hasAudio: Boolean(voice.audioUrl),
      })

      if (voice.audioUrl) {
        playbackActiveRef.current = true
        playbackStartedRef.current = false
        playbackEndedAtMsRef.current = null
        clearResumeListeningTimer()
        await speechCancelListeningRef.current()
        setStatus('session.status.playing_reply')
        setPlaybackQueue(startPlaybackQueue(voice.audioUrl))
        setAudioUrl(voice.audioUrl)
        logVoiceMetric('playback_enqueued', { elapsedMs: Date.now() - submitStartedAt })
      } else {
        playbackActiveRef.current = false
        setStatus('session.status.reply_without_audio')
        if (sessionActiveRef.current && canListenOnRouteRef.current) {
          scheduleResumeListening(500)
        }
      }
      const completedTurn = completeCoachPlayback({
        snapshot: nextSnapshot,
        corrections: coachReply.corrections,
      })
      snapshotRef.current = completedTurn.snapshot
      setSnapshot(completedTurn.snapshot)
    } catch (error) {
      const recovery = recoverSessionError({
        snapshot: nextSnapshot,
        reason: 'coach_reply_failed',
        activeSession: isSessionActive,
        canListenOnRoute: canListenOnRouteRef.current,
      })
      snapshotRef.current = recovery.snapshot
      setSnapshot(recovery.snapshot)
      const requestError = formatApiRequestError(error, {
        context: 'mobile_session_submit',
        presentation: 'banner',
      })
      logVoiceMetric('mobile_session_request_error', requestError.logData)
      displayErrorFeedback(requestError, 'mobile_session_submit')
      setStatus(requestError.displayMessage)
      if (sessionActiveRef.current && canListenOnRouteRef.current) {
        scheduleResumeListening(900)
      }
    } finally {
      if (turnRequestRef.current === turnRequestId) setBusy(false)
    }
  }, [
    accent.name, accent.region, api, audio.isRecording, busy, clearResumeListeningTimer, isSessionActive,
    logVoiceMetric, scenario.description, scenario.name, scheduleResumeListening, synthesizeCoachSpeech,
  ])

  const handleNativeFinalTranscript = useCallback(async (finalTranscript: string) => {
    const finalReceivedAt = Date.now()
    const transcript = finalTranscript.trim()
    if (!transcript) return
    const endpointTranscript = [pendingNativeTranscriptRef.current, transcript]
      .map(part => part.trim())
      .filter(Boolean)
      .join(' ')

    if (!sessionActiveRef.current) {
      logVoiceMetric('transcript_ignored_inactive', { chars: transcript.length })
      setStatus('session.status.speech_captured')
      return
    }

    const currentSnapshot = snapshotRef.current
    const currentMessages = messagesRef.current
    const transcriptGate = gateUserTranscript({
      activeSession: sessionActiveRef.current,
      canListenOnRoute: canListenOnRouteRef.current,
      workflowState: currentSnapshot.state,
      transcript: endpointTranscript,
      playbackActive: playbackActiveRef.current,
      audioPlaying: audio.isPlaying,
      playbackEndedAtMs: playbackEndedAtMsRef.current,
      nowMs: Date.now(),
      cooldownMs: DEFAULT_PLAYBACK_COOLDOWN_MS,
    })
    if (!transcriptGate.accepted) {
      logVoiceMetric('transcript_gate_rejected', {
        reason: transcriptGate.reason,
        chars: endpointTranscript.length,
      })
      if (transcriptGate.reason === 'playback_active') {
        void speechCancelListeningRef.current()
      }
      pendingNativeTranscriptRef.current = ''
      return
    }

    const echoGuard = shouldIgnoreLikelyPlaybackEcho({
      transcript: endpointTranscript,
      lastAssistantResponse: currentSnapshot.lastResponse,
      playbackEndedAtMs: playbackEndedAtMsRef.current,
      nowMs: Date.now(),
    })
    if (echoGuard.shouldIgnore) {
      logVoiceMetric('transcript_echo_ignored', {
        overlapRatio: echoGuard.overlapRatio,
        chars: endpointTranscript.length,
      })
      pendingNativeTranscriptRef.current = ''
      setStatus(listeningStartupStatus())
      if (!playbackActiveRef.current && !audioPlayingRef.current) {
        void speechStartListeningRef.current('en-US')
      }
      return
    }

    const baseUrl = apiBaseUrl.trim()
    const endpointRequestId = ++endpointRequestRef.current
    logVoiceMetric('endpoint_start', { chars: endpointTranscript.length })
    const endpointResult = await judgeEndpoint({
      transcript: endpointTranscript,
      listeningDurationMs: Date.now() - listeningStartMsRef.current,
      messages: currentMessages,
      scenario: scenario.key,
      semanticCheck: auth.state === 'signed-in' ? async (t, ctx) => {
        const authHeaders = await getAuthHeaders()
        const res = await fetch(`${baseUrl}/api/semantic-endpoint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-MeteorVoice-Client': 'meteorvoice-mobile', ...authHeaders },
          body: JSON.stringify({ transcript: t, messages: ctx.messages, scenario: ctx.scenario }),
        })
        if (res.status === 401) await handleUnauthorized()
        if (!res.ok) throw new Error('Semantic check failed')
        const data = await res.json() as { judgment: 'done' | 'thinking' }
        return data.judgment
      } : undefined,
    })
    if (endpointRequestId !== endpointRequestRef.current || !sessionActiveRef.current || !canListenOnRouteRef.current || playbackActiveRef.current) return
    logVoiceMetric('endpoint_done', {
      judgment: endpointResult.judgment,
      reason: endpointResult.reason,
      elapsedMs: Date.now() - finalReceivedAt,
    })

    if (endpointResult.judgment === 'continue') {
      pendingNativeTranscriptRef.current = endpointTranscript
      setStatus(listeningStartupStatus())
      if (!playbackActiveRef.current && !audioPlayingRef.current) {
        void speechStartListeningRef.current('en-US')
      }
      return
    }

    pendingNativeTranscriptRef.current = ''
    logVoiceMetric('submit_turn_start', { chars: endpointTranscript.length })
    void submitTurn(endpointTranscript)
  }, [apiBaseUrl, audio.isPlaying, auth.state, getAuthHeaders, handleUnauthorized, listeningStartupStatus, logVoiceMetric, scenario.key, submitTurn])

  const handleListeningEndedWithoutTranscript = useCallback(() => {
    if (!sessionActiveRef.current || !canListenOnRouteRef.current || busy || playbackActiveRef.current || audioPlayingRef.current) {
      logVoiceMetric('stt_end_restart_skipped', {
        busy,
        playbackActive: playbackActiveRef.current,
        audioPlaying: audioPlayingRef.current,
      })
      return
    }
    logVoiceMetric('stt_end_restart_scheduled')
    scheduleResumeListening(250, false)
  }, [busy, logVoiceMetric, scheduleResumeListening])

  const cancelXunfeiSessionListening = useCallback(async (reason = 'cancel') => {
    const current = xunfeiSessionSttRef.current
    if (!current || current.settled) return
    current.settled = true
    if (current.finalizeTimer) clearTimeout(current.finalizeTimer)
    if (current.hardTimer) clearTimeout(current.hardTimer)
    if (current.noFrameTimer) clearTimeout(current.noFrameTimer)
    current.frameSubscription?.remove()
    current.stateSubscription?.remove()
    if (current.socket && current.socket.readyState === WebSocket.OPEN) {
      current.socket.close()
    }
    await stopPcmCapture(`session_${reason}`).catch(() => undefined)
    xunfeiSessionSttRef.current = null
    logVoiceMetric('stt_end', { provider: 'xunfei', cancelled: true, reason })
  }, [logVoiceMetric])

  const startXunfeiSessionListening = useCallback(async () => {
    if (xunfeiSessionSttRef.current && !xunfeiSessionSttRef.current.settled) return true
    if (!availableSessionSttProviders.includes('xunfei') || !isPcmCaptureAvailable()) {
      logVoiceMetric('stt_provider_fallback', {
        requested: 'xunfei',
        reason: !isPcmCaptureAvailable() ? 'pcm_unavailable' : 'provider_unavailable',
      })
      return nativeSpeechStartListeningRef.current('en-US')
    }
    if (auth.state !== 'signed-in') return nativeSpeechStartListeningRef.current('en-US')

    const streamStartedAt = Date.now()
    let socket: WebSocket | null = null
    let frameSubscription: { remove: () => void } | null = null
    let stateSubscription: { remove: () => void } | null = null
    let finalizeTimer: ReturnType<typeof setTimeout> | null = null
    let hardTimer: ReturnType<typeof setTimeout> | null = null
    let noFrameTimer: ReturnType<typeof setTimeout> | null = null
    let settled = false
    let firstFrame = true
    let finalFrameSent = false
    let finalReceived = false
    let audioSequence = 0
    let frameCount = 0
    let totalBytes = 0
    let transcript = ''
    let firstPartialAt: number | null = null
    const transcriptSegments: string[] = []

    const updateCurrent = () => {
      xunfeiSessionSttRef.current = {
        socket,
        frameSubscription,
        stateSubscription,
        finalizeTimer,
        hardTimer,
        noFrameTimer,
        settled,
      }
    }

    const clearNoFrameTimer = () => {
      if (!noFrameTimer) return
      clearTimeout(noFrameTimer)
      noFrameTimer = null
      updateCurrent()
    }

    const settle = (reason: string, submitted: boolean) => {
      if (settled) return
      settled = true
      updateCurrent()
      if (finalizeTimer) clearTimeout(finalizeTimer)
      if (hardTimer) clearTimeout(hardTimer)
      if (noFrameTimer) clearTimeout(noFrameTimer)
      frameSubscription?.remove()
      void stopPcmCapture(`session_${reason}`).catch(() => undefined).finally(() => stateSubscription?.remove())
      if (socket && socket.readyState === WebSocket.OPEN) socket.close()
      xunfeiSessionSttRef.current = null
      logVoiceMetric('stt_end', {
        provider: 'xunfei',
        cancelled: reason !== 'final',
        reason,
        hadTranscript: Boolean(transcript.trim()),
        submitted,
        elapsedMs: Date.now() - streamStartedAt,
        frameCount,
        totalBytes,
      })
    }

    const sendAudioFrame = (status: 0 | 1 | 2, audioBase64: string, session: CreateASRSessionResponse) => {
      if (!socket || socket.readyState !== WebSocket.OPEN || finalFrameSent) return
      if (status === 2) finalFrameSent = true
      audioSequence += 1
      socket.send(JSON.stringify(createXunfeiASRFrame(session, status, audioBase64, audioSequence)))
    }

    try {
      const authReady = await auth.refreshSession()
      if (!authReady) return nativeSpeechStartListeningRef.current('en-US')

      const session = await api.createASRSession({
        provider: 'xunfei',
        mode: 'streaming',
        languageMode: 'mixed_zh_en',
        scenarioKey: scenario.key,
        sessionId: snapshotRef.current.sessionId,
        endpointSilenceMs: 900,
        clientTraceId: `mobile-session-${Date.now()}`,
      })
      if (session.provider !== 'xunfei' || session.status !== 'created' || session.transport !== 'websocket' || !session.endpointUrl) {
        logVoiceMetric('stt_provider_fallback', { requested: 'xunfei', reason: 'session_not_ready' })
        return nativeSpeechStartListeningRef.current('en-US')
      }

      logVoiceMetric('stt_bootstrap_start', { provider: 'xunfei' })
      setStatus('session.status.preparing_listening')
      await nativeSpeechCancelListeningRef.current()

      socket = new WebSocket(session.endpointUrl)
      updateCurrent()

      const finishAudio = () => {
        if (finalFrameSent) return
        sendAudioFrame(2, '', session)
        void stopPcmCapture('session_endpoint').catch(() => undefined)
      }

      const scheduleFinalize = () => {
        if (finalizeTimer) clearTimeout(finalizeTimer)
        finalizeTimer = setTimeout(finishAudio, session.providerConfig?.eosMs ?? 900)
        updateCurrent()
      }

      stateSubscription = addPcmStateListener(event => {
        logVoiceMetric('stt_pcm_state', {
          provider: 'xunfei',
          state: event.state,
          frameCount: event.frameCount,
          totalBytes: event.totalBytes,
          message: event.message,
        })
      })

      frameSubscription = addPcmFrameListener((event: PcmCaptureFrameEvent) => {
        if (!socket || socket.readyState !== WebSocket.OPEN || finalFrameSent) return
        frameCount += 1
        totalBytes += event.byteCount
        if (frameCount === 1) clearNoFrameTimer()
        sendAudioFrame(firstFrame ? 0 : 1, event.audioBase64, session)
        firstFrame = false
        if (frameCount === 1 || frameCount % 50 === 0) {
          logVoiceMetric('stt_pcm_frame', {
            provider: 'xunfei',
            frameCount,
            totalBytes,
            elapsedMs: event.elapsedMs,
          })
        }
      })

      socket.onopen = () => {
        void startPcmCapture({
          sampleRate: session.providerConfig?.sampleRate ?? 16000,
          frameDurationMs: session.providerConfig?.frameIntervalMs ?? 40,
        }).then(status => {
          listeningStartMsRef.current = Date.now()
          logVoiceMetric('stt_start', { provider: 'xunfei' })
          logVoiceMetric('stt_ready', {
            provider: 'xunfei',
            elapsedMs: Date.now() - streamStartedAt,
            sampleRate: status.sampleRate,
            frameSizeBytes: status.frameSizeBytes,
          })
          setStatus('session.status.listening')
          noFrameTimer = setTimeout(() => {
            if (settled || frameCount > 0) return
            logVoiceMetric('stt_pcm_no_frame', {
              provider: 'xunfei',
              elapsedMs: Date.now() - streamStartedAt,
              pcmStatusFrameCount: status.frameCount,
              pcmStatusTotalBytes: status.totalBytes,
            })
            settle('pcm_no_frame', false)
            handleListeningEndedWithoutTranscript()
          }, 1800)
          updateCurrent()
        }).catch(error => {
          logVoiceMetric('stt_provider_error', {
            provider: 'xunfei',
            message: error instanceof Error ? error.message : 'PCM capture failed',
          })
          settle('pcm_error', false)
          handleListeningEndedWithoutTranscript()
        })
        hardTimer = setTimeout(finishAudio, 15_000)
        updateCurrent()
      }

      socket.onmessage = event => {
        const payload = parseJsonObject(event.data)
        const header = getObject(payload?.header)
        const code = typeof header?.code === 'number'
          ? header.code
          : typeof payload?.code === 'number'
            ? payload.code
            : 0
        if (code !== 0) {
          const message = typeof header?.message === 'string'
            ? header.message
            : typeof payload?.message === 'string'
              ? payload.message
              : `Xunfei ASR error ${code}`
          logVoiceMetric('stt_provider_error', { provider: 'xunfei', code, message })
          settle('provider_error', false)
          handleListeningEndedWithoutTranscript()
          return
        }

        const recognitionResult = extractXunfeiRecognitionResult(payload)
        if (recognitionResult?.text) {
          if (recognitionResult.pgs === 'rpl' && recognitionResult.rg) {
            const [start, end] = recognitionResult.rg
            for (let index = start; index <= end; index += 1) transcriptSegments[index] = ''
          }
          if (recognitionResult.sn != null) {
            transcriptSegments[recognitionResult.sn] = recognitionResult.text
          } else {
            transcriptSegments.push(recognitionResult.text)
          }
          transcript = transcriptSegments.filter(Boolean).join('').trim()
          if (!firstPartialAt) {
            firstPartialAt = Date.now()
            logVoiceMetric('stt_first_partial', {
              provider: 'xunfei',
              elapsedMs: firstPartialAt - streamStartedAt,
              chars: transcript.length,
            })
          }
          logVoiceMetric('stt_partial', { provider: 'xunfei', chars: transcript.length })
          scheduleFinalize()
        }

        const data = getObject(payload?.data)
        const status = typeof header?.status === 'number'
          ? header.status
          : typeof data?.status === 'number'
            ? data.status
            : undefined
        if (status === 2) {
          finalReceived = true
          const normalized = transcript.trim()
          if (normalized) {
            logVoiceMetric('stt_submit', {
              provider: 'xunfei',
              source: 'xunfei_final',
              chars: normalized.length,
              elapsedMs: Date.now() - streamStartedAt,
            })
            void handleNativeFinalTranscript(normalized)
            settle('final', true)
          } else {
            settle('final', false)
            handleListeningEndedWithoutTranscript()
          }
        }
      }

      socket.onerror = () => {
        logVoiceMetric('stt_provider_error', { provider: 'xunfei', message: 'WebSocket error' })
        settle('socket_error', false)
        handleListeningEndedWithoutTranscript()
      }

      socket.onclose = event => {
        logVoiceMetric('stt_socket_close', {
          provider: 'xunfei',
          code: typeof event?.code === 'number' ? event.code : null,
          reason: typeof event?.reason === 'string' ? event.reason : '',
          wasClean: Boolean(event?.wasClean),
          finalReceived,
          finalFrameSent,
          frameCount,
          totalBytes,
        })
        if (!finalReceived && !settled) {
          settle('socket_closed', false)
          handleListeningEndedWithoutTranscript()
        }
      }

      updateCurrent()
      return true
    } catch (error) {
      logVoiceMetric('stt_provider_error', {
        provider: 'xunfei',
        message: error instanceof Error ? error.message : 'Xunfei STT failed to start',
      })
      settle('start_error', false)
      return nativeSpeechStartListeningRef.current('en-US')
    }
  }, [
    api, auth, availableSessionSttProviders, handleListeningEndedWithoutTranscript,
    handleNativeFinalTranscript, logVoiceMetric, scenario.key,
  ])

  const speech = useNativeSpeech({
    onFinalTranscript: handleNativeFinalTranscript,
    onListeningEndedWithoutTranscript: handleListeningEndedWithoutTranscript,
    onMetric: logVoiceMetric,
  })

  useEffect(() => {
    nativeSpeechStartListeningRef.current = speech.startListening
    nativeSpeechCancelListeningRef.current = speech.cancelListening
  }, [speech.cancelListening, speech.startListening])

  useEffect(() => {
    speechStartListeningRef.current = sessionSttProvider === 'xunfei'
      ? startXunfeiSessionListening
      : speech.startListening
    speechCancelListeningRef.current = sessionSttProvider === 'xunfei'
      ? cancelXunfeiSessionListening
      : speech.cancelListening
    startListeningWithProviderRef.current = (provider, lang) => (
      provider === 'xunfei'
        ? startXunfeiSessionListening()
        : speech.startListening(lang)
    )
  }, [
    cancelXunfeiSessionListening, sessionSttProvider, speech, speech.cancelListening, speech.startListening,
    startXunfeiSessionListening,
  ])

  useEffect(() => {
    sessionActiveRef.current = isSessionActive
  }, [isSessionActive])

  const selectTab = useCallback((tab: Tab) => {
    setActiveTab(tab)
    if (tab !== 'session') {
      canListenOnRouteRef.current = false
      playbackEndedAtMsRef.current = null
      clearResumeListeningTimer()
      endpointRequestRef.current += 1
      pendingNativeTranscriptRef.current = ''
      void speechCancelListeningRef.current()
      if (sessionActiveRef.current) setStatus('session.paused')
      return
    }

    canListenOnRouteRef.current = true
    if (sessionActiveRef.current && !busy && !playbackActiveRef.current && !audioPlayingRef.current) {
      listeningStartMsRef.current = Date.now()
      setStatus(listeningStartupStatus())
      void speechStartListeningRef.current('en-US')
    }
  }, [busy, clearResumeListeningTimer, listeningStartupStatus])

  async function endSession() {
    if (!canEndSession({ activeSession: isSessionActive, workflowState: snapshot.state })) return

    // 立即结束 session，不等 API
    turnRequestRef.current += 1
    sessionActiveRef.current = false
    canListenOnRouteRef.current = false
    playbackActiveRef.current = false
    audioPlayingRef.current = false
    playbackStartedRef.current = false
    playbackEndedAtMsRef.current = null
    clearResumeListeningTimer()
    endpointRequestRef.current += 1
    pendingNativeTranscriptRef.current = ''
    audio.stopPlayback()
    setAudioUrl(null)
    setPlaybackQueue(createPlaybackQueueSnapshot())
    void speechCancelListeningRef.current()
    const endedSnapshot = endActiveSession(snapshot).snapshot
    setSnapshot(endedSnapshot)
    setIsSessionActive(false)
    setStatus('session.ended')
    setBusy(false)

    const userTurns = messages.filter(m => m.role === 'user').length
    try {
      const result = await api.generateSummary({
        sessionId: snapshot.sessionId,
        scenario: scenario.name,
        messages,
        turnNumber: userTurns,
      })
      setSummary(result.summary)
      await api.syncSession({
        session_id: snapshot.sessionId,
        scenario: scenario.name,
        accent: accent.name,
        turns: userTurns,
        messages,
        corrections: correctionHistory,
      }).catch(() => undefined)
    } catch {
      // summary 失败不影响 session 已结束的状态
    }
  }

  function selectScenario(key: string) {
    setSelectedScenarioKey(key)
    setMessages([])
    setCorrectionHistory([])
    setAudioUrl(null)
    setPlaybackQueue(createPlaybackQueueSnapshot())
    setSummary(null)
    setSnapshot(createInitialSnapshot('mobile-session'))
    setIsSessionActive(false)
    setStatus('session.status.scenario_selected')
  }

  const loadHistory = useCallback(async () => {
    if (historyLoading) return
    if (auth.state !== 'signed-in') {
      setHistoryError(tr('history.auth_required'))
      return
    }
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const result = await api.listHistory()
      setHistorySessions(result.sessions)
      setSelectedHistory(result.sessions[0] ?? null)
      setSelectedHistoryTurns([])
    } catch (error) {
      const requestError = formatApiRequestError(error, {
        context: 'mobile_history_list',
        presentation: 'inline',
      })
      setHistoryError(requestError.displayMessage)
    } finally {
      setHistoryLoading(false)
    }
  }, [api, auth.state, historyLoading, tr])

  useEffect(() => {
    if (activeTab !== 'history') return
    if (auth.state !== 'signed-in') {
      historyAutoLoadRef.current = false
      return
    }
    if (historyAutoLoadRef.current) return
    historyAutoLoadRef.current = true
    void loadHistory()
  }, [activeTab, auth.state, loadHistory])

  async function deleteSession(id: string) {
    setHistorySessions(prev => prev.map(s => s.id === id ? { ...s, status: 'deleted' } : s))
    try {
      const authHeaders = await getAuthHeaders()
      await fetch(`${apiBaseUrl.trim()}/api/session?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders as Record<string, string>,
      }).then(res => {
        if (res.status === 401) return handleUnauthorized()
        return undefined
      })
    } catch {
      // 静默失败
    }
  }

  async function selectHistorySession(item: HistorySession) {
    setSelectedHistory(item)
    setSelectedHistoryTurns([])
    try {
      const result = await api.listSessionTurns(item.id)
      setSelectedHistoryTurns(result.turns)
    } catch (error) {
      const requestError = formatApiRequestError(error, {
        context: 'mobile_history_turns',
        presentation: 'inline',
      })
      setHistoryError(requestError.displayMessage)
    }
  }

  const applyPreferences = useCallback((preferences: PreferencesResponse, successMessage?: string) => {
    setLocale(preferences.locale === 'zh' ? 'zh' : 'en')
    setTtsProvider(preferences.tts_provider ?? 'mock')
    setAvailableProviders(preferences.available_providers?.length ? preferences.available_providers : ['mock'])
    setTtsSpeed(preferences.tts_speed ?? 1)
    if (preferences.tts_voice_id !== undefined) setTtsVoiceId(preferences.tts_voice_id)
    if (preferences.voice_profiles) setVoiceProfiles(preferences.voice_profiles)
    if (preferences.selected_voice_profile_id !== undefined) setSelectedVoiceProfileId(preferences.selected_voice_profile_id)
    if (preferences.xunfei_voices?.configured) setXunfeiVoices(preferences.xunfei_voices.configured)
    if (preferences.default_scenario_key) setSelectedScenarioKey(preferences.default_scenario_key)
    const profile = preferences.voice_profiles?.find(item => item.id === preferences.selected_voice_profile_id)
    if (profile) setSelectedAccentKey(profile.accentKey)
    if (preferences.ui_theme && !themeInitializedRef.current) {
      themeInitializedRef.current = true
      void SecureStore.getItemAsync('theme_set_at').then(localSetAt => {
        const serverTs = new Date(preferences.ui_theme_updated_at ?? new Date(0).toISOString()).getTime()
        const localTs = localSetAt ? new Date(localSetAt).getTime() : 0
        if (serverTs >= localTs) {
          applyThemeLocal(preferences.ui_theme as Parameters<typeof setThemeLocal>[0])
        }
      })
    }
    setSettingsMessage(successMessage ?? tr('session.status.preferences_loaded'))
  }, [applyThemeLocal, setLocale, tr])

  const applyTtsPreferences = useCallback((preferences: PreferencesResponse, successMessage = tr('session.status.preferences_saved')) => {
    setTtsProvider(preferences.tts_provider ?? 'mock')
    setTtsSpeed(preferences.tts_speed ?? 1)
    if (preferences.tts_voice_id !== undefined) setTtsVoiceId(preferences.tts_voice_id)
    if (preferences.selected_voice_profile_id !== undefined) setSelectedVoiceProfileId(preferences.selected_voice_profile_id)
    const profiles = preferences.voice_profiles ?? voiceProfiles
    const profile = profiles.find(item => item.id === preferences.selected_voice_profile_id)
    if (profile) setSelectedAccentKey(profile.accentKey)
    setSettingsMessage(successMessage)
  }, [tr, voiceProfiles])

  const applyPracticePreferences = useCallback((preferences: PreferencesResponse, successMessage = tr('session.status.practice_defaults_saved')) => {
    setTtsProvider(preferences.tts_provider ?? 'mock')
    setTtsSpeed(preferences.tts_speed ?? 1)
    if (preferences.default_scenario_key) setSelectedScenarioKey(preferences.default_scenario_key)
    setSettingsMessage(successMessage)
  }, [tr])

  const applyVoiceProfilePreferences = useCallback((preferences: PreferencesResponse, successMessage = tr('session.status.preferences_saved')) => {
    setTtsProvider(preferences.tts_provider ?? 'mock')
    if (preferences.tts_voice_id !== undefined) setTtsVoiceId(preferences.tts_voice_id)
    if (preferences.selected_voice_profile_id !== undefined) setSelectedVoiceProfileId(preferences.selected_voice_profile_id)
    const profiles = preferences.voice_profiles ?? voiceProfiles
    const profile = profiles.find(item => item.id === preferences.selected_voice_profile_id)
    if (profile) setSelectedAccentKey(profile.accentKey)
    setSettingsMessage(successMessage)
  }, [tr, voiceProfiles])

  const applyLocalePreferences = useCallback((preferences: PreferencesResponse, successMessage = tr('session.status.preferences_saved')) => {
    setLocale(preferences.locale === 'zh' ? 'zh' : 'en')
    setSettingsMessage(successMessage)
  }, [setLocale, tr])

  const fetchSessionSttProviders = useCallback(async () => {
    const result = await api.listASRProviders()
    const providers: SessionSttProvider[] = ['native']
    if (result.providers.some(provider => provider.key === 'xunfei' && provider.enabled)) {
      providers.push('xunfei')
    }
    return providers
  }, [api])

  const applySessionSttProviders = useCallback((providers: SessionSttProvider[]) => {
    setAvailableSessionSttProviders(providers)
    if (!providers.includes(sessionSttProvider)) {
      sessionSttProviderRef.current = 'native'
      setSessionSttProviderState('native')
      void SecureStore.setItemAsync(sessionSttProviderStorageKey, 'native')
    }
  }, [sessionSttProvider])

  const loadSessionSttProviders = useCallback(async () => {
    try {
      const providers = await fetchSessionSttProviders()
      applySessionSttProviders(providers)
      sessionSttProvidersLoadedRef.current = true
    } catch (error) {
      const requestError = formatApiRequestError(error, {
        context: 'mobile_asr_providers_load',
        presentation: 'silent',
      })
      logVoiceMetric('mobile_silent_request_error', requestError.logData)
    }
  }, [applySessionSttProviders, fetchSessionSttProviders, logVoiceMetric])

  useEffect(() => appFeedback.subscribe(setActiveFeedback), [])

  useEffect(() => {
    if (settingsLoading && activeTab === 'settings') {
      appFeedback.show({
        message: tr('settings.syncing'),
        variant: 'hud',
        source: 'settings',
      })
      return
    }
    appFeedback.hide('settings')
  }, [activeTab, settingsLoading, tr])

  const loadPreferences = useCallback(async (options: { force?: boolean; successMessage?: string } = {}) => {
    if (settingsLoadingRef.current && !options.force) return
    if (auth.state !== 'signed-in') {
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
        context: 'mobile_preferences_load',
        presentation: 'inline',
      })
      setSettingsMessage(requestError.displayMessage)
    } finally {
      if (requestId === settingsRequestRef.current) {
        setSettingsLoadingFlag(false)
      }
    }
  }, [api, applyPreferences, auth.state, setSettingsLoadingFlag, tr])

  const loadSettingsDataGroup = useCallback(() => {
    if (settingsLoadingRef.current) return () => undefined
    if (auth.state !== 'signed-in') {
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
        providers: fetchSessionSttProviders,
      },
    }).then(({ preferences: preferencesResult, providers: providersResult }) => {
      if (cancelled || requestId !== settingsRequestRef.current) return

      if (preferencesResult.status === 'fulfilled') {
        applyPreferences(preferencesResult.value)
      } else {
        const requestError = formatApiRequestError(preferencesResult.reason, {
          context: 'mobile_preferences_load',
          presentation: 'inline',
        })
        setSettingsMessage(requestError.displayMessage)
      }

      if (providersResult.status === 'fulfilled') {
        applySessionSttProviders(providersResult.value)
      } else {
        const requestError = formatApiRequestError(providersResult.reason, {
          context: 'mobile_asr_providers_load',
          presentation: 'silent',
        })
        logVoiceMetric('mobile_silent_request_error', requestError.logData)
      }
    }).finally(() => {
      if (!cancelled && requestId === settingsRequestRef.current) {
        setSettingsLoadingFlag(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [
    api, applyPreferences, applySessionSttProviders, auth.state,
    fetchSessionSttProviders, logVoiceMetric, setSettingsLoadingFlag, tr,
  ])

  const reloadSettingsData = useCallback(() => loadSettingsDataGroup(), [loadSettingsDataGroup])

  useEffect(() => {
    if (auth.state !== 'signed-in') {
      settingsAutoLoadRef.current = false
      return
    }
    if (activeTab !== 'settings' || settingsAutoLoadRef.current) return
    settingsAutoLoadRef.current = true
    return reloadSettingsData()
  }, [activeTab, auth.state, reloadSettingsData])

  async function saveProvider(provider: string) {
    settingsRequestRef.current += 1
    setTtsProvider(provider)
    setAudioUrl(null)
    playbackEndedAtMsRef.current = null
    setSettingsLoadingFlag(true)
    setSettingsMessage(null)
    if (auth.state !== 'signed-in') {
      setSettingsMessage(tr('session.status.preferences_saved'))
      setSettingsLoadingFlag(false)
      return
    }

    try {
      const preferences = await api.updatePreferences({
        tts_provider: provider,
        default_scenario_key: selectedScenarioKey,
        tts_speed: ttsSpeed,
      })
      applyTtsPreferences(preferences)
    } catch (error) {
      const requestError = formatApiRequestError(error, {
        context: 'mobile_preferences_save_provider',
        presentation: 'inline',
      })
      setSettingsMessage(requestError.displayMessage)
    } finally {
      setSettingsLoadingFlag(false)
    }
  }

  async function savePracticePreferences() {
    settingsRequestRef.current += 1
    setSettingsLoadingFlag(true)
    setSettingsMessage(null)
    if (auth.state !== 'signed-in') {
      setSettingsMessage(tr('session.status.practice_defaults_saved'))
      setSettingsLoadingFlag(false)
      return
    }

    try {
      const preferences = await api.updatePreferences({
        tts_provider: ttsProvider,
        default_scenario_key: selectedScenarioKey,
        tts_speed: ttsSpeed,
      })
      applyPracticePreferences(preferences)
    } catch (error) {
      const requestError = formatApiRequestError(error, {
        context: 'mobile_preferences_save_practice',
        presentation: 'inline',
      })
      setSettingsMessage(requestError.displayMessage)
    } finally {
      setSettingsLoadingFlag(false)
    }
  }

  function adjustSpeed(delta: number) {
    setTtsSpeed(previous => {
      const next = Math.min(1.3, Math.max(0.7, Number((previous + delta).toFixed(1))))
      if (prefSyncTimerRef.current) clearTimeout(prefSyncTimerRef.current)
      prefSyncTimerRef.current = setTimeout(() => {
        void syncMobilePreferences({
          apiBaseUrl: apiBaseUrl.trim(),
          getAuthHeaders: auth.getAuthHeaders,
          onUnauthorized: handleUnauthorized,
          ttsSpeed: next,
          ttsProvider,
          defaultScenarioKey: selectedScenarioKey,
        }).then(preferences => {
          if (preferences) {
            applyTtsPreferences(preferences)
          }
        })
      }, 600)
      return next
    })
  }

  async function selectVoiceProfile(profile: VoiceProfile) {
    if (profile.status !== 'active') return
    settingsRequestRef.current += 1
    setAudioUrl(null)
    playbackEndedAtMsRef.current = null
    setSelectedVoiceProfileId(profile.id)
    setTtsProvider(profile.provider)
    setTtsVoiceId(profile.providerVoiceId)
    setSelectedAccentKey(profile.accentKey)
    setSettingsMessage(null)
    if (auth.state !== 'signed-in') return

    try {
      const preferences = await api.updatePreferences({ selected_voice_profile_id: profile.id })
      applyVoiceProfilePreferences(preferences)
    } catch (error) {
      const requestError = formatApiRequestError(error, {
        context: 'mobile_preferences_select_voice_profile',
        presentation: 'silent',
      })
      logVoiceMetric('mobile_silent_request_error', requestError.logData)
    }
  }

  async function saveLocalePreference(nextLocale: Locale) {
    if (nextLocale === locale) return
    setLocale(nextLocale)

    if (auth.state !== 'signed-in') {
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
        context: 'mobile_preferences_save_locale',
        presentation: 'banner',
      })
      setSettingsMessage(requestError.displayMessage)
      displayErrorFeedback(requestError, 'mobile_preferences_save_locale')
    } finally {
      if (requestId === settingsRequestRef.current) {
        setSettingsLoadingFlag(false)
      }
    }
  }

  async function submitAuth() {
    const normalizedEmail = email.trim()
    if (!normalizedEmail || !password || auth.state === 'loading') return
    const success = await auth.submit(authMode, normalizedEmail, password)
    if (success) setPassword('')
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSessionSttProviders()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadSessionSttProviders])

  // 登录后自动拉取偏好
  useEffect(() => {
    if (auth.state !== 'signed-in') return
    const timer = setTimeout(() => {
      loadSettingsDataGroup()
    }, 0)
    return () => clearTimeout(timer)
  }, [auth.state, loadSettingsDataGroup])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        canListenOnRouteRef.current = false
        playbackEndedAtMsRef.current = null
        clearResumeListeningTimer()
        endpointRequestRef.current += 1
        pendingNativeTranscriptRef.current = ''
        void speechCancelListeningRef.current()
        if (sessionActiveRef.current) setStatus('session.paused')
        return
      }

      canListenOnRouteRef.current = true
      if (auth.state === 'signed-in') {
        void loadPreferences()
      }

      if (sessionActiveRef.current && !busy && !playbackActiveRef.current && !audioPlayingRef.current) {
        listeningStartMsRef.current = Date.now()
        setStatus(listeningStartupStatus())
        void speechStartListeningRef.current('en-US')
      }
    })
    return () => subscription.remove()
  }, [auth.state, busy, clearResumeListeningTimer, listeningStartupStatus, loadPreferences])

  function playCorrection(text: string) {
    clearResumeListeningTimer()
    void speechCancelListeningRef.current()
    void synthesizeCoachSpeech(text).then(voice => {
      if (voice.audioUrl) {
        isCorrectionPlayingRef.current = true
        playbackActiveRef.current = true
        playbackStartedRef.current = false
        playbackEndedAtMsRef.current = null
        setStatus('session.status.playing_reply')
        setAudioUrl(voice.audioUrl)
      }
    }).catch(() => {})
  }

  function renderScreen() {
    switch (activeTab) {
      case 'session':
        return (
          <SessionScreen
            tr={tr}
            snapshot={snapshot}
            messages={messages}
            corrections={correctionHistory}
            isSessionActive={isSessionActive}
            status={status}
            summary={summary}
            busy={busy}
            scenarioName={getScenarioLabel(scenario, locale)}
            scenarioIcon={scenario.icon}
            scenarioDifficulty={getDifficultyLabel(scenario.difficulty, locale)}
            scenarioDescription={getScenarioDescription(scenario, locale)}
            accentName={sessionAccentName}
            accentRegion={sessionAccentRegion}
            onStart={startSession}
            onEnd={() => void endSession()}
            onPlayCorrection={playCorrection}
            onSubmitText={text => void submitTurn(text)}
          />
        )
      case 'home':
        return (
          <HomeScreen
            tr={tr}
            locale={locale}
            scenarios={scenarios}
            selectedScenarioKey={selectedScenarioKey}
            isSessionActive={isSessionActive}
            onSelectScenario={selectScenario}
            onGoToSession={() => selectTab('session')}
          />
        )
      case 'history':
        return (
          <HistoryScreen
            tr={tr}
            locale={locale}
            sessions={historySessions}
            loading={historyLoading}
            error={historyError}
            selectedHistory={selectedHistory}
            selectedTurns={selectedHistoryTurns}
            onLoad={() => void loadHistory()}
            onSelect={item => void selectHistorySession(item)}
            onDelete={id => void deleteSession(id)}
          />
        )
      case 'settings':
        return (
          <SettingsScreen
            tr={tr}
            locale={locale}
            ttsProvider={ttsProvider}
            availableProviders={availableProviders}
            sessionSttProvider={sessionSttProvider}
            availableSessionSttProviders={availableSessionSttProviders}
            ttsSpeed={ttsSpeed}
            ttsVoiceId={ttsVoiceId}
            voiceProfiles={voiceProfiles}
            selectedVoiceProfileId={selectedVoiceProfileId}
            xunfeiVoices={xunfeiVoices}
            settingsLoading={settingsLoading}
            settingsMessage={settingsMessage}
            auth={auth}
            email={email}
            password={password}
            authMode={authMode}
            apiBaseUrl={apiBaseUrl}
            apiBaseUrlSource={apiBaseUrlSource}
            defaultApiBaseUrl={defaultApiBaseUrl}
            appVersion={appVersion}
            voiceMetricsText={voiceMetricsText}
            asrEvaluationText={asrEvaluationText}
            onSetLocale={l => void saveLocalePreference(l as Locale)}
            onSetTheme={setTheme}
            onSaveProvider={p => void saveProvider(p)}
            onSetSessionSttProvider={setSessionSttProvider}
            onAdjustSpeed={adjustSpeed}
            onSavePracticePreferences={() => void savePracticePreferences()}
            onLoadPreferences={() => { reloadSettingsData() }}
            onSelectVoiceProfile={profile => void selectVoiceProfile(profile)}
            onSetEmail={setEmail}
            onSetPassword={setPassword}
            onSetAuthMode={setAuthMode}
            onSubmitAuth={() => void submitAuth()}
            onSignOut={() => void auth.signOut()}
            onSetApiBaseUrl={updateApiBaseUrl}
            onResetApiBaseUrl={resetApiBaseUrl}
            onClearVoiceMetrics={() => setVoiceMetrics([])}
            onShareVoiceMetrics={() => {
              void Share.share({
                title: 'MeteorVoice voice diagnostics',
                message: voiceMetricsText || 'No voice metrics yet.',
              })
            }}
            onShareASREvaluation={() => {
              void Share.share({
                title: 'MeteorVoice ASR P4 evaluation',
                message: asrEvaluationText,
              })
            }}
          />
        )
    }
  }

  const styles = makeStyles()

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
}
