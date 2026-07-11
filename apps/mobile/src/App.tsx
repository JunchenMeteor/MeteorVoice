/**
 * App entry point — ThemeProvider, LogProvider, SessionContext orchestration.
 * 应用入口 — 主题、日志、会话编排。
 */

import type { AppStateStatus } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import {
  File,
  Paths,
} from 'expo-file-system'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Alert,
  AppState,
} from 'react-native'

import type {
  PlaybackQueueSnapshot,
  WorkflowSnapshot,
} from '@meteorvoice/session-core'
import type {
  AppFeedbackState,
  ConversationMessage,
  ConversationResponse,
  Locale,
  TranslateFn,
} from '@meteorvoice/shared'
import type { SyncSessionRequest } from '@meteorvoice/api-client'
import type { PreferencesResponse } from '@meteorvoice/api-client'
import {
  createMeteorVoiceApiClient,
  fetchWithTimeout,
  formatApiRequestError,
} from '@meteorvoice/api-client'
import {
  accentProfiles,
  appFeedback,
  displayErrorFeedback,
  getAccentLabel,
  getAccentRegion,
  getDifficultyLabel,
  getScenarioDescription,
  getScenarioLabel,
  getTTSSpeedRouting,
  scenarios,
  translate,
} from '@meteorvoice/shared'
import {
  acceptTranscriptTurn,
  canAcceptUserTranscript,
  canEndSession,
  completeCoachPlayback,
  createInitialSnapshot,
  createPlaybackQueueSnapshot,
  DEFAULT_PLAYBACK_COOLDOWN_MS,
  endActiveSession,
  gateUserTranscript,
  judgeEndpoint,
  receiveCoachReply,
  recoverSessionError,
  requestCoachReply,
  shouldIgnoreLikelyPlaybackEcho,
  startListeningSession,
  startPlaybackQueue,
} from '@meteorvoice/session-core'

import {
  SessionContext,
  type SessionContextValue,
} from './SessionContext'
import type {
  SessionRoutePresence,
  SessionSttProvider,
  Tab,
} from './sessionRuntime'
import { AppShell } from './AppShell'
import { useXunfeiStt } from './hooks/useXunfeiStt'
import { useMobileAuth } from './mobileAuth'
import { useNativeSessionAudio } from './nativeAudio'
import { useNativeSpeech } from './nativeSpeech'
import { useHandlerBridge } from './utils/handlerBridge'
import {
  LogProvider,
  useLog,
} from './LogContext'
import {
  getDefaultApiBaseUrl,
  getDisplayAppVersion,
} from './mobileConfig'
import { ThemeProvider } from './ThemeProvider'
import {
  canApplyEndpointResult,
  classifyRequestTerminalStage,
  isTurnStale,
} from './sessionTurnRuntime'
import { AppFeedbackOverlay } from './components/AppFeedbackOverlay'
import {
  enqueueSessionSync,
  flushSessionSyncOutbox,
} from './sessionSyncOutbox'
import {
  canStartListening,
  enqueueRuntimeOperation,
  getPlaybackTailPrewarmDecision,
  routePresenceForTab,
  shouldResumeListening,
  STT_MAX_CONSECUTIVE_RESTARTS,
  withTimeout,
} from './sessionRuntime'

const defaultApiBaseUrl = getDefaultApiBaseUrl()
const appVersion = getDisplayAppVersion()
const sessionSttProviderStorageKey = 'session_stt_provider'
const sessionSyncOutboxStorage = {
  getItem: async (key: string) => {
    const file = sessionSyncOutboxFile(key)
    return file.exists ? file.text() : null
  },
  setItem: async (key: string, value: string) => {
    const file = sessionSyncOutboxFile(key)
    if (!file.exists) file.create({ intermediates: true })
    file.write(value)
  },
  removeItem: async (key: string) => {
    const file = sessionSyncOutboxFile(key)
    if (file.exists) file.delete()
  },
}

function sessionSyncOutboxFile(key: string) {
  return new File(Paths.document, `${key.replace(/[^a-z0-9._-]/gi, '_')}.json`)
}

// ─── Main Entry / 入口 ───

export default function App({ children }: { children?: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LogProvider>
        <AppInner>{children}</AppInner>
      </LogProvider>
    </ThemeProvider>
  )
}

// ─── AppInner / 编排层 ───

function AppInner({ children }: { children?: React.ReactNode }) {
  /* eslint-disable react-hooks/exhaustive-deps */
  const { logMetric, logUserAction, setEnrichment } = useLog()

  // ─── Navigation / 导航 ───
  const [activeTab, setActiveTab] = useState<Tab>('session')

  // ─── Session State / 会话状态 ───
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [correctionHistory, setCorrectionHistory] = useState<ConversationResponse['corrections']>([])
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [playbackQueue, setPlaybackQueue] = useState<PlaybackQueueSnapshot>(() => createPlaybackQueueSnapshot())
  const [status, setStatusState] = useState('session.ready')
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot>(() => createInitialSnapshot('mobile-session'))
  const [summary, setSummary] = useState<string | null>(null)
  const [busy, setBusyState] = useState(false)

  // ─── Scenario & Accent / 场景与口音 ───
  const [selectedScenarioKey, setSelectedScenarioKey] = useState('small-talk')
  const [selectedAccentKey, setSelectedAccentKey] = useState('american')
  const [scenarioSwitching, setScenarioSwitching] = useState(false)
  const [apiSessionId] = useState<string | null>(null)

  // ─── Language / 语言 ───
  const [locale, setLocaleState] = useState<Locale>('en')
  useEffect(() => {
    SecureStore.getItemAsync('app_locale').then(v => { if (v === 'zh' || v === 'en') setLocaleState(v) })
  }, [])
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    void SecureStore.setItemAsync('app_locale', l)
  }, [])

  // ─── Provider State / 提供者状态 ───
  const [ttsProvider, setTtsProvider] = useState('mock')
  const [ttsVoiceId, setTtsVoiceId] = useState<string | null>(null)
  const [ttsSpeed, setTtsSpeed] = useState(1)
  const [sessionSttProvider, setSessionSttProviderState] = useState<SessionSttProvider>('native')
  const [activeFeedback, setActiveFeedback] = useState<AppFeedbackState | null>(() => appFeedback.getFeedback())

  // ─── TTS & Audio / 语音合成与音频 ───
  const ttsSpeedRouting = getTTSSpeedRouting(ttsProvider, ttsSpeed)
  const audio = useNativeSessionAudio(audioUrl, ttsSpeedRouting.playbackRate)
  const auth = useMobileAuth()
  const getAuthHeaders = auth.getAuthHeaders
  const signOut = auth.signOut

  const tr: TranslateFn = useCallback((key, values) => translate(locale, key, values), [locale])

  const handleUnauthorized = useCallback(() => {
    if (auth.state !== 'signed-in') return signOut(null)
    return signOut(tr('settings.auth_expired'))
  }, [auth.state, signOut, tr])

  const api = useMemo(() => createMeteorVoiceApiClient({
    baseUrl: defaultApiBaseUrl.trim(),
    headers: getAuthHeaders,
    onUnauthorized: handleUnauthorized,
  }), [getAuthHeaders, handleUnauthorized])

  const applyTtsPreferences = useCallback((preferences: PreferencesResponse) => {
    if (preferences.tts_provider) setTtsProvider(preferences.tts_provider)
    if (typeof preferences.tts_speed === 'number') setTtsSpeed(preferences.tts_speed)
    if (preferences.tts_voice_id !== undefined) setTtsVoiceId(preferences.tts_voice_id)
  }, [])

  useEffect(() => {
    if (auth.state !== 'signed-in') return
    let cancelled = false
    void api.getPreferences()
      .then(preferences => { if (!cancelled) applyTtsPreferences(preferences) })
      .catch(error => {
        logMetric('mobile_preferences_startup_error', {
          message: error instanceof Error ? error.message : 'unknown',
        })
      })
    return () => { cancelled = true }
  }, [api, applyTtsPreferences, auth.state, logMetric])

  // ─── Derived Values / 派生值 ───
  const scenario = useMemo(() => scenarios.find(s => s.key === selectedScenarioKey) ?? scenarios[0], [selectedScenarioKey])
  const accent = useMemo(() => accentProfiles.find(a => a.key === selectedAccentKey) ?? accentProfiles[0], [selectedAccentKey])

  // Voice profile accent override (for SettingsScreen voice selection)
  const voiceProfileAccentLabel = null  // TODO: wire from SettingsScreen voice profile selection
  const voiceProfileAccentRegion = null

  // ─── Refs / 可变引用 ───
  const snapshotRef = useRef(snapshot)
  const messagesRef = useRef(messages)
  const statusRef = useRef(status)
  const sessionActiveRef = useRef(false)
  const canListenOnRouteRef = useRef(true)
  const routePresenceRef = useRef<SessionRoutePresence>('inSession')
  const playbackActiveRef = useRef(false)
  const audioPlayingRef = useRef(false)
  const busyRef = useRef(false)
  const playbackStartedRef = useRef(false)
  const playbackEndedAtMsRef = useRef<number | null>(null)
  const pendingNativeTranscriptRef = useRef('')
  const isCorrectionPlayingRef = useRef(false)
  const resumeListeningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listeningStartMsRef = useRef(0)
  const listeningTeardownRef = useRef<Promise<void> | null>(null)
  const endpointRequestRef = useRef(0)
  const turnRequestRef = useRef(0)
  const sessionGenerationRef = useRef(0)
  const sttRestartCountRef = useRef(0)
  const sttRestartStartMsRef = useRef(0)
  const sttStreamIdRef = useRef(0)
  const sttOperationQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const sttPrewarmAudioUrlRef = useRef<string | null>(null)
  const sessionSyncFlushRef = useRef<Promise<void> | null>(null)

  const clearAudio = useCallback(() => {
    setAudioUrl(null)
    playbackEndedAtMsRef.current = null
  }, [])

  // STT provider refs
  const sessionSttProviderRef = useRef(sessionSttProvider)
  const sessionSttProviderHydratedRef = useRef(false)
  const speechStartListeningRef = useRef<(lang?: string) => Promise<boolean>>(() => Promise.resolve(false))
  const speechCancelListeningRef = useRef<() => void | Promise<void>>(() => undefined)
  const nativeSpeechStartListeningRef = useRef<(lang?: string) => Promise<boolean>>(() => Promise.resolve(false))
  const nativeSpeechCancelListeningRef = useRef<() => void | Promise<void>>(() => undefined)
  const startListeningWithProviderRef = useRef<(provider: SessionSttProvider, lang?: string) => Promise<boolean>>(() => Promise.resolve(false))

  // Ref syncs: state → ref
  useEffect(() => { snapshotRef.current = snapshot }, [snapshot])
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { statusRef.current = status }, [status])
  useEffect(() => { sessionSttProviderRef.current = sessionSttProvider }, [sessionSttProvider])
  useEffect(() => { busyRef.current = busy }, [busy])
  useEffect(() => { sessionActiveRef.current = isSessionActive }, [isSessionActive])

  const flushPendingSessionSyncs = useCallback(() => {
    if (auth.state !== 'signed-in') return Promise.resolve()
    if (sessionSyncFlushRef.current) return sessionSyncFlushRef.current
    const run = flushSessionSyncOutbox(sessionSyncOutboxStorage, payload => api.syncSession(payload))
      .then(result => {
        if (result.synced > 0) logMetric('session_sync_outbox_flushed', result)
        if (result.remaining > 0) logMetric('session_sync_outbox_pending', result)
        if (result.synced > 0 && result.remaining === 0 && !sessionActiveRef.current && statusRef.current === 'session.sync_pending') {
          statusRef.current = 'session.ended'
          setStatusState('session.ended')
        }
      })
      .catch(error => {
        logMetric('session_sync_outbox_error', {
          message: error instanceof Error ? error.message : 'unknown',
        })
      })
      .finally(() => { sessionSyncFlushRef.current = null })
    sessionSyncFlushRef.current = run
    return run
  }, [api, auth.state, logMetric])

  useEffect(() => {
    if (auth.state === 'signed-in') void flushPendingSessionSyncs()
  }, [auth.state, flushPendingSessionSyncs])

  // ─── STT Provider / 语音识别提供者 ───
  const setSessionSttProvider = useCallback((provider: SessionSttProvider) => {
    sessionSttProviderRef.current = provider
    setSessionSttProviderState(provider)
    void SecureStore.setItemAsync(sessionSttProviderStorageKey, provider)
  }, [])

  // ─── Voice Metrics / 语音指标 ───
  const setStatus = useCallback((nextStatus: string) => {
    const previous = statusRef.current
    statusRef.current = nextStatus
    if (previous !== nextStatus) logMetric('ui_status_changed', { from: previous, to: nextStatus })
    setStatusState(nextStatus)
  }, [logMetric])

  const setBusy = useCallback((nextBusy: boolean) => {
    busyRef.current = nextBusy
    if (busyRef.current !== nextBusy) logMetric('ui_busy_changed', { from: !nextBusy, to: nextBusy })
    setBusyState(nextBusy)
  }, [logMetric])

  const setRoutePresence = useCallback((next: SessionRoutePresence, reason: string) => {
    const previous = routePresenceRef.current
    routePresenceRef.current = next
    canListenOnRouteRef.current = next === 'inSession'
    if (previous !== next) logMetric('route_presence_changed', { from: previous, to: next, reason })
  }, [logMetric])

  const canStartSessionListening = useCallback((context: string, generation?: number) => {
    const gen = generation ?? sessionGenerationRef.current
    const gate = {
      sessionActive: sessionActiveRef.current, routePresence: routePresenceRef.current,
      canListenOnRoute: canListenOnRouteRef.current, busy: busyRef.current,
      playbackActive: playbackActiveRef.current, audioPlaying: audioPlayingRef.current,
      generation: gen, currentGeneration: sessionGenerationRef.current,
    }
    const allowed = canStartListening(gate)
    if (!allowed) logMetric('stt_start_aborted', { context, ...gate })
    return allowed
  }, [logMetric])

  const clearResumeListeningTimer = useCallback(() => {
    if (!resumeListeningTimerRef.current) return
    clearTimeout(resumeListeningTimerRef.current)
    resumeListeningTimerRef.current = null
  }, [])

  const scheduleResumeListening = useCallback((delayMs = DEFAULT_PLAYBACK_COOLDOWN_MS, updateStatus = true) => {
    clearResumeListeningTimer()
    resumeListeningTimerRef.current = setTimeout(() => {
      resumeListeningTimerRef.current = null
      if (!canStartSessionListening('resume_timer')) {
        logMetric('resume_listening_skipped', {})
        return
      }
      listeningStartMsRef.current = Date.now()
      if (updateStatus) {
        setStatus(sessionSttProviderRef.current === 'xunfei' ? 'session.status.preparing_listening' : 'session.status.listening')
      }
      void speechStartListeningRef.current('en-US')
    }, delayMs)
  }, [canStartSessionListening, clearResumeListeningTimer, logMetric, setStatus])

  const enqueueSttOperation = useCallback(<T,>(label: string, operation: () => Promise<T>) => {
    const { task, queue } = enqueueRuntimeOperation({
      queue: sttOperationQueueRef.current, label, log: logMetric, operation,
    })
    sttOperationQueueRef.current = queue
    return task
  }, [logMetric])

  const cancelListeningForReason = useCallback((reason: string) => {
    const task = Promise.resolve()
      .then(() => speechCancelListeningRef.current())
      .catch(error => { logMetric('listening_teardown_error', { reason, message: error instanceof Error ? error.message : 'teardown failed' }) })
      .finally(() => {
        if (listeningTeardownRef.current === task) listeningTeardownRef.current = null
        logMetric('listening_teardown_done', { reason })
      })
    listeningTeardownRef.current = task
    return task
  }, [logMetric])

  // ─── Native Speech / 原生语音 ───
  const nativeFinalTranscriptRef = useHandlerBridge<(t: string) => Promise<void>>()
  const nativeEndedWithoutTranscriptRef = useHandlerBridge<() => void>()
  const xunfeiFinalTranscriptRef = useHandlerBridge<(t: string) => Promise<void>>()
  const xunfeiEndedWithoutTranscriptRef = useHandlerBridge<() => void>()

  const speech = useNativeSpeech({
    onFinalTranscript: useCallback((t: string) => { void nativeFinalTranscriptRef.current(t) }, []),
    onListeningEndedWithoutTranscript: useCallback(() => { nativeEndedWithoutTranscriptRef.current() }, []),
    onMetric: useCallback((stage: string, data?: Record<string, unknown>) => { logMetric(stage, data) }, [logMetric]),
  })

  useEffect(() => {
    nativeSpeechStartListeningRef.current = speech.startListening
    nativeSpeechCancelListeningRef.current = speech.cancelListening
  }, [speech.cancelListening, speech.startListening])

  // ─── Xunfei STT Engine / 讯飞语音识别引擎 ───
  const xunfeiStt = useXunfeiStt({
    network: { api, auth },
    context: { locale, selectedScenarioKey },
    refs: {
      snapshot: snapshotRef, sessionGeneration: sessionGenerationRef,
      sttStreamId: sttStreamIdRef, sttRestartCount: sttRestartCountRef,
      sttRestartStartMs: sttRestartStartMsRef, listeningStartMs: listeningStartMsRef,
    },
    session: {
      sessionActive: sessionActiveRef, routePresence: routePresenceRef,
      canListenOnRoute: canListenOnRouteRef, playbackActive: playbackActiveRef,
      audioPlaying: audioPlayingRef,
    },
    callbacks: { logMetric, setStatus, enqueueSttOperation, canStartSessionListening },
    bridge: {
      nativeSpeechStart: nativeSpeechStartListeningRef,
      nativeSpeechCancel: nativeSpeechCancelListeningRef,
      finalTranscript: xunfeiFinalTranscriptRef,
      endedWithoutTranscript: xunfeiEndedWithoutTranscriptRef,
    },
  })
  const { startXunfeiSessionListening, cancelXunfeiSessionListening } = xunfeiStt
  // Synced from hook — used by prewarm/ref wiring effects
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const xunfeiSessionSttRef = xunfeiStt.xunfeiSessionSttRef

  // ─── STT Ref Wiring / 语音识别引用接线 ───
  useEffect(() => {
    speechStartListeningRef.current = sessionSttProvider === 'xunfei'
      ? () => startXunfeiSessionListening(false).then(() => true)
      : speech.startListening
    speechCancelListeningRef.current = sessionSttProvider === 'xunfei'
      ? cancelXunfeiSessionListening
      : speech.cancelListening
    startListeningWithProviderRef.current = (provider, lang) =>
      provider === 'xunfei' ? startXunfeiSessionListening().then(() => true) : speech.startListening(lang)
  }, [sessionSttProvider, speech, startXunfeiSessionListening, cancelXunfeiSessionListening])

  // ─── Prewarm / 预热 ───
  useEffect(() => {
    if (!audioUrl || sessionSttProvider !== 'xunfei') { sttPrewarmAudioUrlRef.current = null; return }
    const decision = getPlaybackTailPrewarmDecision({
      provider: sessionSttProvider, isPlaying: audio.isPlaying, playbackActive: playbackActiveRef.current,
      audioUrl, prewarmedAudioUrl: sttPrewarmAudioUrlRef.current,
      playbackDurationSeconds: audio.playbackDurationSeconds, playbackRemainingMs: audio.playbackRemainingMs,
    })
    if (!decision.shouldPrewarm || decision.remainingMs == null) return
    sttPrewarmAudioUrlRef.current = audioUrl
    const timer = setTimeout(() => { void startXunfeiSessionListening(true) }, 0)
    return () => clearTimeout(timer)
  }, [audio.isPlaying, audio.playbackDurationSeconds, audio.playbackRemainingMs, audioUrl, sessionSttProvider, startXunfeiSessionListening])

  // ─── Orchestration / 编排函数 ───

  const synthesizeCoachSpeech = useCallback(async (text: string) => {
    return api.synthesizeSpeech({ text, accent: accent.name, provider: ttsProvider, speed: ttsSpeedRouting.serverSpeed, voiceId: ttsVoiceId ?? undefined })
  }, [accent.name, api, ttsProvider, ttsSpeedRouting.serverSpeed, ttsVoiceId])

  const submitTurn = useCallback(async (sourceTranscript: string) => {
    const submitStartedAt = Date.now()
    const submitGeneration = sessionGenerationRef.current
    const transcript = sourceTranscript.trim()
    if (busyRef.current || audio.isRecording || playbackActiveRef.current ||
      !canAcceptUserTranscript({ activeSession: isSessionActive, canListenOnRoute: canListenOnRouteRef.current, workflowState: snapshotRef.current.state, transcript })) return

    const acceptedTurn = acceptTranscriptTurn({ snapshot: snapshotRef.current, transcript, messages: messagesRef.current })
    snapshotRef.current = acceptedTurn.snapshot
    messagesRef.current = acceptedTurn.messages
    setSnapshot(acceptedTurn.snapshot)
    setMessages(acceptedTurn.messages)
    setAudioUrl(null); setPlaybackQueue(createPlaybackQueueSnapshot())
    listeningStartMsRef.current = 0; playbackEndedAtMsRef.current = null; pendingNativeTranscriptRef.current = ''
    clearResumeListeningTimer()
    await cancelListeningForReason('submit_turn')
    setBusy(true)
    const turnRequestId = ++turnRequestRef.current
    let terminalLogged = false
    let nextSnapshot = acceptedTurn.snapshot

    const logTerminal = (stage: string, data: Record<string, unknown> = {}) => {
      terminalLogged = true
      logMetric(stage, { turnRequestId, generation: submitGeneration, elapsedMs: Date.now() - submitStartedAt, ...data })
    }

    try {
      setStatus('session.status.requesting_reply')
      nextSnapshot = requestCoachReply(nextSnapshot)
      snapshotRef.current = nextSnapshot; setSnapshot(nextSnapshot)
      const reply = await withTimeout(api.generateCoachReply({
        messages: messagesRef.current,
        context: { scenario: { name: scenario.name, description: scenario.description }, accentProfile: { name: accent.name, region: accent.region }, sessionId: nextSnapshot.sessionId, turnNumber: messagesRef.current.filter(m => m.role === 'user').length, responseLocale: locale },
      }), 20_000, 'Coach reply request timed out.')
      if (isTurnStale({ turnRequestId, currentTurnRequestId: turnRequestRef.current, generation: submitGeneration, currentGeneration: sessionGenerationRef.current, sessionActive: sessionActiveRef.current })) {
        logTerminal('submit_turn_ignored_stale', { reason: 'coach_reply_stale' }); return
      }
      setCorrectionHistory(prev => [...prev, ...reply.corrections])
      const coachTurn = receiveCoachReply({ snapshot: nextSnapshot, messages: messagesRef.current, responseText: reply.text, corrections: reply.corrections })
      nextSnapshot = coachTurn.snapshot; snapshotRef.current = nextSnapshot; messagesRef.current = coachTurn.messages
      setMessages(coachTurn.messages); setSnapshot(nextSnapshot)

      setStatus('session.status.requesting_voice')
      if (!reply.text.trim()) {
        setStatus('session.status.reply_without_text')
        const gate = { sessionActive: sessionActiveRef.current, routePresence: routePresenceRef.current, canListenOnRoute: canListenOnRouteRef.current, busy: false, playbackActive: playbackActiveRef.current, audioPlaying: audioPlayingRef.current, generation: submitGeneration, currentGeneration: sessionGenerationRef.current }
        if (shouldResumeListening(gate)) scheduleResumeListening(500)
        logTerminal('submit_turn_done', { reason: 'reply_without_text' }); return
      }
      const voice = await withTimeout(synthesizeCoachSpeech(reply.text), 20_000, 'Coach voice request timed out.')
      if (isTurnStale({ turnRequestId, currentTurnRequestId: turnRequestRef.current, generation: submitGeneration, currentGeneration: sessionGenerationRef.current, sessionActive: sessionActiveRef.current })) {
        logTerminal('submit_turn_ignored_stale', { reason: 'tts_stale' }); return
      }
      if (voice.audioUrl) {
        playbackActiveRef.current = true; playbackStartedRef.current = false; playbackEndedAtMsRef.current = null
        clearResumeListeningTimer(); await cancelListeningForReason('playback_enqueue')
        setStatus('session.status.playing_reply'); setPlaybackQueue(startPlaybackQueue(voice.audioUrl)); setAudioUrl(voice.audioUrl)
      } else {
        playbackActiveRef.current = false; setStatus('session.status.reply_without_audio')
        const gate = { sessionActive: sessionActiveRef.current, routePresence: routePresenceRef.current, canListenOnRoute: canListenOnRouteRef.current, busy: false, playbackActive: playbackActiveRef.current, audioPlaying: audioPlayingRef.current, generation: submitGeneration, currentGeneration: sessionGenerationRef.current }
        if (shouldResumeListening(gate)) scheduleResumeListening(500)
      }
      const completed = completeCoachPlayback({ snapshot: nextSnapshot, corrections: reply.corrections })
      snapshotRef.current = completed.snapshot; setSnapshot(completed.snapshot)
      logTerminal('submit_turn_done', { hasAudio: Boolean(voice.audioUrl) })
    } catch (error) {
      const terminal = classifyRequestTerminalStage(error)
      logTerminal(terminal.stage, { message: terminal.message })
      const recovery = recoverSessionError({ snapshot: nextSnapshot!, reason: 'coach_reply_failed', activeSession: isSessionActive, canListenOnRoute: canListenOnRouteRef.current })
      snapshotRef.current = recovery.snapshot; setSnapshot(recovery.snapshot)
      const requestError = formatApiRequestError(error, { context: 'mobile_session_submit', presentation: 'banner' })
      logMetric('mobile_session_request_error', requestError.logData)
      displayErrorFeedback(requestError, 'mobile_session_submit')
      setStatus(requestError.displayMessage)
      const gate = { sessionActive: sessionActiveRef.current, routePresence: routePresenceRef.current, canListenOnRoute: canListenOnRouteRef.current, busy: false, playbackActive: playbackActiveRef.current, audioPlaying: audioPlayingRef.current, generation: submitGeneration, currentGeneration: sessionGenerationRef.current }
      if (shouldResumeListening(gate)) scheduleResumeListening(900)
    } finally {
      if (turnRequestRef.current === turnRequestId) setBusy(false)
      if (!terminalLogged) logMetric('submit_turn_finally_without_terminal', { turnRequestId, generation: submitGeneration, elapsedMs: Date.now() - submitStartedAt })
    }
  }, [accent, api, audio.isRecording, cancelListeningForReason, clearResumeListeningTimer, isSessionActive, logMetric, scenario, scheduleResumeListening, setBusy, setStatus, synthesizeCoachSpeech, locale])

  const handleNativeFinalTranscript = useCallback(async (finalTranscript: string) => {
    const transcript = finalTranscript.trim()
    if (!transcript) return
    const endpointTranscript = [pendingNativeTranscriptRef.current, transcript].map(p => p.trim()).filter(Boolean).join(' ')
    if (!sessionActiveRef.current) { setStatus('session.status.speech_captured'); return }

    const gate = gateUserTranscript({
      activeSession: sessionActiveRef.current, canListenOnRoute: canListenOnRouteRef.current,
      workflowState: snapshotRef.current.state, transcript: endpointTranscript,
      playbackActive: playbackActiveRef.current, audioPlaying: audio.isPlaying,
      playbackEndedAtMs: playbackEndedAtMsRef.current, nowMs: Date.now(), cooldownMs: DEFAULT_PLAYBACK_COOLDOWN_MS,
    })
    if (!gate.accepted) {
      if (gate.reason === 'playback_active') void cancelListeningForReason('transcript_gate_playback_active')
      pendingNativeTranscriptRef.current = ''; return
    }
    const echo = shouldIgnoreLikelyPlaybackEcho({ transcript: endpointTranscript, lastAssistantResponse: snapshotRef.current.lastResponse, playbackEndedAtMs: playbackEndedAtMsRef.current, nowMs: Date.now() })
    if (echo.shouldIgnore) {
      pendingNativeTranscriptRef.current = ''
      setStatus(sessionSttProviderRef.current === 'xunfei' ? 'session.status.preparing_listening' : 'session.status.listening')
      const gate2 = { sessionActive: sessionActiveRef.current, routePresence: routePresenceRef.current, canListenOnRoute: canListenOnRouteRef.current, busy: busyRef.current, playbackActive: playbackActiveRef.current, audioPlaying: audioPlayingRef.current }
      if (shouldResumeListening(gate2)) void speechStartListeningRef.current('en-US')
      return
    }
    const endpointRequestId = ++endpointRequestRef.current
    let endpointResult: Awaited<ReturnType<typeof judgeEndpoint>>
    try {
      endpointResult = await judgeEndpoint({
        transcript: endpointTranscript, listeningDurationMs: Date.now() - listeningStartMsRef.current,
        messages: messagesRef.current, scenario: scenario.key,
        semanticCheck: auth.state === 'signed-in' ? async (t, ctx) => {
          const authHeaders = await getAuthHeaders()
          const res = await fetchWithTimeout(fetch, `${defaultApiBaseUrl.trim()}/api/semantic-endpoint`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MeteorVoice-Client': 'meteorvoice-mobile', ...authHeaders },
            body: JSON.stringify({ transcript: t, messages: ctx.messages, scenario: ctx.scenario }),
          })
          if (res.status === 401) handleUnauthorized()
          if (!res.ok) throw new Error('Semantic check failed')
          const data = await res.json() as { judgment: 'done' | 'thinking' }
          return data.judgment
        } : undefined,
      })
    } catch {
      pendingNativeTranscriptRef.current = endpointTranscript
      setStatus(sessionSttProviderRef.current === 'xunfei' ? 'session.status.preparing_listening' : 'session.status.listening')
      const gate2 = { sessionActive: sessionActiveRef.current, routePresence: routePresenceRef.current, canListenOnRoute: canListenOnRouteRef.current, busy: busyRef.current, playbackActive: playbackActiveRef.current, audioPlaying: audioPlayingRef.current }
      if (shouldResumeListening(gate2)) void speechStartListeningRef.current('en-US')
      return
    }
    if (!canApplyEndpointResult({ endpointRequestId, currentEndpointRequestId: endpointRequestRef.current, sessionActive: sessionActiveRef.current, canListenOnRoute: canListenOnRouteRef.current, playbackActive: playbackActiveRef.current })) return
    if (endpointResult.judgment === 'continue') {
      pendingNativeTranscriptRef.current = endpointTranscript
      setStatus(sessionSttProviderRef.current === 'xunfei' ? 'session.status.preparing_listening' : 'session.status.listening')
      const gate2 = { sessionActive: sessionActiveRef.current, routePresence: routePresenceRef.current, canListenOnRoute: canListenOnRouteRef.current, busy: busyRef.current, playbackActive: playbackActiveRef.current, audioPlaying: audioPlayingRef.current }
      if (shouldResumeListening(gate2)) void speechStartListeningRef.current('en-US')
      return
    }
    pendingNativeTranscriptRef.current = ''
    void submitTurn(endpointTranscript)
  }, [audio.isPlaying, auth.state, cancelListeningForReason, defaultApiBaseUrl, getAuthHeaders, handleUnauthorized, logMetric, scenario.key, setStatus, submitTurn])

  const handleListeningEndedWithoutTranscript = useCallback(() => {
    const gate = { sessionActive: sessionActiveRef.current, routePresence: routePresenceRef.current, canListenOnRoute: canListenOnRouteRef.current, busy: busyRef.current, playbackActive: playbackActiveRef.current, audioPlaying: audioPlayingRef.current }
    if (!shouldResumeListening(gate)) return
    sttRestartCountRef.current += 1
    if (sttRestartCountRef.current > STT_MAX_CONSECUTIVE_RESTARTS) {
      sttRestartCountRef.current = 0; sttRestartStartMsRef.current = 0
      void nativeSpeechStartListeningRef.current('en-US')
      return
    }
    if (sttRestartCountRef.current === 1) sttRestartStartMsRef.current = Date.now()
    scheduleResumeListening(Math.min(250 * Math.pow(2, sttRestartCountRef.current - 1), 8000), false)
  }, [scheduleResumeListening])

  const startSession = useCallback(async () => {
    logUserAction('session_start_tap', { scenario: scenario.key })
    if (scenarioSwitching) return
    if (auth.state !== 'signed-in') { setActiveTab('settings'); setStatus('login.signin'); return }
    setStatus('session.status.preparing_listening')
    // Wait for any pending teardown to complete before starting
    const pendingTeardown = listeningTeardownRef.current
    if (pendingTeardown) await pendingTeardown
    await cancelListeningForReason('session_start_reset')

    // Hydrate STT provider from SecureStore
    if (!sessionSttProviderHydratedRef.current) {
      const stored = await SecureStore.getItemAsync(sessionSttProviderStorageKey)
      if (stored === 'xunfei' || stored === 'native') { setSessionSttProvider(stored); sessionSttProviderRef.current = stored }
      sessionSttProviderHydratedRef.current = true
    }

    const provider = sessionSttProviderRef.current
    endpointRequestRef.current += 1; sessionGenerationRef.current += 1
    sttRestartCountRef.current = 0; sttRestartStartMsRef.current = 0
    clearResumeListeningTimer()
    playbackActiveRef.current = false; playbackStartedRef.current = false; playbackEndedAtMsRef.current = null
    listeningStartMsRef.current = Date.now(); pendingNativeTranscriptRef.current = ''
    sessionActiveRef.current = true; setRoutePresence('inSession', 'session_start')
    const nextId = apiSessionId ?? `mobile-${Date.now()}`
    const nextSnap = startListeningSession(nextId)
    snapshotRef.current = nextSnap; messagesRef.current = []
    setSnapshot(nextSnap); setMessages([]); setCorrectionHistory([])
    setAudioUrl(null); playbackEndedAtMsRef.current = null
    setPlaybackQueue(createPlaybackQueueSnapshot()); setSummary(null)
    setIsSessionActive(true)
    setStatus(provider === 'xunfei' ? 'session.status.preparing_listening' : 'session.status.listening')
    void startListeningWithProviderRef.current(provider, 'en-US')
  }, [logUserAction, scenario, scenarioSwitching, auth.state, setActiveTab, setStatus, cancelListeningForReason, clearResumeListeningTimer, setRoutePresence, apiSessionId])

  const endSession = useCallback(async () => {
    logUserAction('session_stop_tap')
    if (!canEndSession({ activeSession: isSessionActive, workflowState: snapshot.state })) return
    turnRequestRef.current += 1; sessionGenerationRef.current += 1
    sttRestartCountRef.current = 0; sttRestartStartMsRef.current = 0
    sessionActiveRef.current = false; setRoutePresence('outSession', 'session_end')
    playbackActiveRef.current = false; audioPlayingRef.current = false
    playbackStartedRef.current = false; playbackEndedAtMsRef.current = null
    clearResumeListeningTimer(); endpointRequestRef.current += 1; pendingNativeTranscriptRef.current = ''
    audio.stopPlayback(); setAudioUrl(null); setPlaybackQueue(createPlaybackQueueSnapshot())
    void cancelListeningForReason('session_end')
    const ended = endActiveSession(snapshot).snapshot
    setSnapshot(ended); setIsSessionActive(false); setStatus('session.ended'); setBusy(false)
    const userTurns = messagesRef.current.filter(m => m.role === 'user').length
    const syncPayload: SyncSessionRequest = {
      session_id: snapshot.sessionId,
      scenario: scenario.name,
      accent: accent.name,
      turns: userTurns,
      messages: messagesRef.current,
      corrections: correctionHistory,
    }
    try {
      const result = await api.generateSummary({ sessionId: snapshot.sessionId, scenario: scenario.name, messages: messagesRef.current, turnNumber: userTurns })
      setSummary(result.summary)
    } catch {
      logMetric('session_summary_failed')
    }
    try {
      await api.syncSession(syncPayload)
      logMetric('session_sync_done', { sessionId: snapshot.sessionId })
    } catch (error) {
      try {
        await enqueueSessionSync(sessionSyncOutboxStorage, syncPayload)
        setStatus('session.sync_pending')
        logMetric('session_sync_queued', {
          sessionId: snapshot.sessionId,
          message: error instanceof Error ? error.message : 'unknown',
        })
      } catch (storageError) {
        setStatus('session.sync_failed')
        logMetric('session_sync_outbox_error', {
          sessionId: snapshot.sessionId,
          message: storageError instanceof Error ? storageError.message : 'unknown',
        })
      }
    }
  }, [accent.name, api, audio, cancelListeningForReason, clearResumeListeningTimer, correctionHistory, isSessionActive, logMetric, logUserAction, scenario, setBusy, setRoutePresence, setStatus, snapshot])

  const selectScenario = useCallback(async (key: string) => {
    if (scenarioSwitching) return false
    if (key === selectedScenarioKey) return true
    // Confirmation dialog when switching scenarios during an active session
    if (isSessionActive) {
      const confirmed = await new Promise<boolean>(resolve => {
        Alert.alert(tr('session.switch_scenario_title'), tr('session.switch_scenario_message'), [
          { text: tr('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: tr('common.confirm'), style: 'destructive', onPress: () => resolve(true) },
        ])
      })
      if (!confirmed) return false
    }
    setScenarioSwitching(true); setStatus('session.status.switching_session')
    try {
      turnRequestRef.current += 1; endpointRequestRef.current += 1; sessionGenerationRef.current += 1
      sttRestartCountRef.current = 0; sttRestartStartMsRef.current = 0
      sessionActiveRef.current = false; setRoutePresence('outSession', 'scenario_change')
      playbackActiveRef.current = false; audioPlayingRef.current = false
      playbackStartedRef.current = false; playbackEndedAtMsRef.current = null
      clearResumeListeningTimer(); pendingNativeTranscriptRef.current = ''
      audio.stopPlayback(); setBusy(false)
      await cancelListeningForReason('scenario_change')
      setSelectedScenarioKey(key); setMessages([]); setCorrectionHistory([])
      setAudioUrl(null); setPlaybackQueue(createPlaybackQueueSnapshot())
      setSummary(null); setSnapshot(createInitialSnapshot('mobile-session'))
      setIsSessionActive(false); setStatus('session.status.scenario_selected')
      return true
    } finally { setScenarioSwitching(false) }
  }, [scenarioSwitching, selectedScenarioKey, setStatus, audio, cancelListeningForReason, clearResumeListeningTimer, setBusy, setRoutePresence])

  const playCorrection = useCallback((text: string) => {
    logUserAction('play_correction_tap', { chars: text.length })
    clearResumeListeningTimer()
    void cancelListeningForReason('play_correction')
    void synthesizeCoachSpeech(text).then(voice => {
      if (voice.audioUrl) {
        isCorrectionPlayingRef.current = true
        playbackActiveRef.current = true; playbackStartedRef.current = false; playbackEndedAtMsRef.current = null
        setStatus('session.status.playing_reply'); setAudioUrl(voice.audioUrl)
      }
    }).catch(() => {})
  }, [logUserAction, clearResumeListeningTimer, cancelListeningForReason, synthesizeCoachSpeech, setStatus])

  // ─── Handler Wiring / 回调接线 ───
  useEffect(() => {
    nativeFinalTranscriptRef.current = handleNativeFinalTranscript
    nativeEndedWithoutTranscriptRef.current = handleListeningEndedWithoutTranscript
    xunfeiFinalTranscriptRef.current = handleNativeFinalTranscript
    xunfeiEndedWithoutTranscriptRef.current = handleListeningEndedWithoutTranscript
  })

  // ─── Playback Effects / 播放效果 ───
  useEffect(() => {
    audioPlayingRef.current = audio.isPlaying
    if (audio.isPlaying && audioUrl && playbackActiveRef.current && !playbackStartedRef.current) {
      playbackStartedRef.current = true; sttPrewarmAudioUrlRef.current = null
      void cancelListeningForReason('playback_started')
    }
  }, [audio.isPlaying, audioUrl, cancelListeningForReason])

  useEffect(() => {
    if (!audioUrl || !audio.didJustFinish || audio.isPlaying || !playbackStartedRef.current) return
    let cancelled = false
    const advance = () => {
      if (cancelled) return
      if (isCorrectionPlayingRef.current) {
        isCorrectionPlayingRef.current = false
        playbackActiveRef.current = false; playbackStartedRef.current = false; playbackEndedAtMsRef.current = Date.now()
        const gate = { sessionActive: sessionActiveRef.current, routePresence: routePresenceRef.current, canListenOnRoute: canListenOnRouteRef.current, busy: busyRef.current, playbackActive: playbackActiveRef.current, audioPlaying: audioPlayingRef.current, generation: sessionGenerationRef.current, currentGeneration: sessionGenerationRef.current }
        setStatus(shouldResumeListening(gate) ? 'session.status.listening' : 'session.status.reply_played')
        if (shouldResumeListening(gate)) scheduleResumeListening(900, false)
        return
      }
      // Simple: just finish playback and resume listening
      playbackActiveRef.current = false; playbackStartedRef.current = false; playbackEndedAtMsRef.current = Date.now()
      setStatus('session.status.reply_played')
      const gate = { sessionActive: sessionActiveRef.current, routePresence: routePresenceRef.current, canListenOnRoute: canListenOnRouteRef.current, busy: busyRef.current, playbackActive: playbackActiveRef.current, audioPlaying: audioPlayingRef.current, generation: sessionGenerationRef.current, currentGeneration: sessionGenerationRef.current }
      if (shouldResumeListening(gate)) scheduleResumeListening()
    }
    const t = setTimeout(advance, 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [audio.didJustFinish, audio.isPlaying, audioUrl, cancelListeningForReason, clearResumeListeningTimer, scheduleResumeListening, setStatus])

  // ─── AppState Listener / 应用状态监听 ───
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        setRoutePresence('outSession', `app_state:${nextState}`)
        playbackEndedAtMsRef.current = null; clearResumeListeningTimer()
        endpointRequestRef.current += 1; pendingNativeTranscriptRef.current = ''
        void cancelListeningForReason(`app_state:${nextState}`)
        if (sessionActiveRef.current) setStatus('session.paused')
        return
      }
      setRoutePresence(routePresenceForTab(activeTab), 'app_state:active')
      void flushPendingSessionSyncs()
      if (canStartSessionListening('app_state_active')) {
        listeningStartMsRef.current = Date.now()
        if (sessionSttProviderRef.current === 'xunfei') setStatus('session.status.preparing_listening')
        else setStatus('session.status.listening')
        void speechStartListeningRef.current('en-US')
      }
    })
    return () => sub.remove()
  }, [activeTab, canStartSessionListening, cancelListeningForReason, clearResumeListeningTimer, flushPendingSessionSyncs, setRoutePresence, setStatus])

  // ─── Log Enrichment / 日志上下文注入 ───
  useEffect(() => {
    setEnrichment({
      activeTab, scenarioKey: selectedScenarioKey, sessionActive: isSessionActive,
      busy, ttsProvider, sttProvider: sessionSttProvider,
    })
  }, [activeTab, selectedScenarioKey, isSessionActive, busy, ttsProvider, sessionSttProvider, setEnrichment])

  // ─── Cleanup / 清理 ───
  useEffect(() => () => clearResumeListeningTimer(), [clearResumeListeningTimer])
  useEffect(() => appFeedback.subscribe(setActiveFeedback), [])

  // HUD feedback overlay effects
  // Placeholder states kept for HUD overlay feedbaack compatibility

  useEffect(() => {
    if (scenarioSwitching) {
      appFeedback.show({ message: tr('session.status.switching_session'), variant: 'hud', source: 'session-transition' })
    } else {
      appFeedback.hide('session-transition')
    }
  }, [scenarioSwitching, tr])

  // ─── STT Provider Preflight / 语音识别提供者预检 ───
  useEffect(() => {
    SecureStore.getItemAsync(sessionSttProviderStorageKey).then(value => {
      if (value === 'xunfei' || value === 'native') { setSessionSttProvider(value); sessionSttProviderRef.current = value }
      sessionSttProviderHydratedRef.current = true
    })
  }, [setSessionSttProvider])

  useEffect(() => {
    if (auth.state !== 'signed-in') return
    // Fetch available ASR providers from server
    api.listASRProviders().then(result => {
      const providers: SessionSttProvider[] = ['native']
      if (result.providers.some(p => p.key === 'xunfei' && p.enabled)) providers.push('xunfei')
      if (!providers.includes(sessionSttProviderRef.current)) {
        sessionSttProviderRef.current = 'native'
        setSessionSttProvider('native')
      }
    }).catch(() => { /* silent — provider list is best-effort */ })
  }, [auth.state, api, setSessionSttProvider])

  // ─── SessionContext Value / 会话上下文值 ───
  const sessionContext = useMemo<SessionContextValue>(() => ({
    appVersion, applyTtsPreferences, auth, defaultApiBaseUrl, getAuthHeaders, handleUnauthorized, signOut,
    snapshot, messages, corrections: correctionHistory, summary,
    isSessionActive, status, busy, scenarioSwitching,
    locale, tr,
    ttsProvider, ttsVoiceId,
    selectedScenarioKey, selectedAccentKey,
    voiceProfileAccentLabel, voiceProfileAccentRegion,
    audioUrl, api,
    startSession, endSession, playCorrection, selectScenario, setLocale, submitText: submitTurn,
    clearAudio,
  }), [applyTtsPreferences, auth, clearAudio, getAuthHeaders, handleUnauthorized, signOut, snapshot, messages, correctionHistory, summary, isSessionActive, status, busy, scenarioSwitching, locale, tr, ttsProvider, ttsVoiceId, selectedScenarioKey, selectedAccentKey, voiceProfileAccentLabel, voiceProfileAccentRegion, audioUrl, api, startSession, endSession, playCorrection, selectScenario, setLocale, submitTurn, playbackQueue, setSelectedAccentKey, setTtsProvider, setTtsVoiceId, setTtsSpeed])

  // ─── Tab Selection / 标签选择 ───
  const selectTab = useCallback((tab: Tab) => {
    logUserAction('tab_tap', { to: tab })
    setActiveTab(tab)
    const presence = routePresenceForTab(tab)
    setRoutePresence(presence, `tab:${tab}`)
    if (presence === 'outSession') {
      playbackEndedAtMsRef.current = null; clearResumeListeningTimer()
      endpointRequestRef.current += 1; pendingNativeTranscriptRef.current = ''
      void cancelListeningForReason(`tab:${tab}`)
      if (sessionActiveRef.current) setStatus('session.paused')
      return
    }
    // Resume listening when switching to session tab
    if (canStartSessionListening('tab_session')) {
      listeningStartMsRef.current = Date.now()
      setStatus(sessionSttProviderRef.current === 'xunfei' ? 'session.status.preparing_listening' : 'session.status.listening')
      void speechStartListeningRef.current('en-US')
    }
  }, [logUserAction, clearResumeListeningTimer, cancelListeningForReason, setRoutePresence, setStatus, canStartSessionListening])

  // ─── Render / 渲染 ───
  const accentName = voiceProfileAccentLabel ?? getAccentLabel(accent, locale)
  const accentRegion = voiceProfileAccentRegion ?? getAccentRegion(accent, locale)

  if (children !== undefined) {
    return (
      <SessionContext.Provider value={sessionContext}>
        {children}
        <AppFeedbackOverlay feedback={activeFeedback} />
      </SessionContext.Provider>
    )
  }

  return (
    <AppShell
      accentName={accentName}
      accentRegion={accentRegion}
      activeFeedback={activeFeedback}
      activeTab={activeTab}
      api={api}
      appVersion={appVersion}
      auth={auth}
      defaultApiBaseUrl={defaultApiBaseUrl}
      getAuthHeaders={getAuthHeaders}
      handleUnauthorized={handleUnauthorized}
      locale={locale}
      scenarioDescription={getScenarioDescription(scenario, locale)}
      scenarioDifficulty={getDifficultyLabel(scenario.difficulty, locale)}
      scenarioIcon={scenario.icon}
      scenarioName={getScenarioLabel(scenario, locale)}
      selectTab={selectTab}
      sessionContext={sessionContext}
      setActiveTab={setActiveTab}
      setLocale={setLocale}
      signOut={signOut}
      tr={tr}
    />
  )
  /* eslint-enable react-hooks/exhaustive-deps */
}
