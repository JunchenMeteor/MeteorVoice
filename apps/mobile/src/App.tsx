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
  MeteorVoiceApiError,
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
  scenarios,
  t,
  type ConversationMessage,
  type ConversationResponse,
  type Locale,
  type VoiceProfile,
} from '@meteorvoice/shared'

import * as SecureStore from 'expo-secure-store'
import { useMobileAuth } from './mobileAuth'
import { useNativeSessionAudio } from './nativeAudio'
import { useNativeSpeech } from './nativeSpeech'
import { pullMobilePreferences, syncMobilePreferences, type XunfeiVoice } from './mobilePreferences'
import { getDefaultApiBaseUrl, getDisplayAppVersion } from './mobileConfig'
import { ThemeProvider, useTheme } from './ThemeProvider'
import { SessionScreen } from './screens/SessionScreen'
import { HomeScreen } from './screens/HomeScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SettingsScreen } from './screens/SettingsScreen'

const defaultApiBaseUrl = getDefaultApiBaseUrl()
const appVersion = getDisplayAppVersion()
const apiBaseUrlStorageKey = 'api_base_url'
type Tab = 'session' | 'home' | 'history' | 'settings'
type VoiceMetricEntry = {
  ts: number
  stage: string
  data: Record<string, unknown>
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
      if (stored) setApiBaseUrl(stored)
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
  const [ttsProvider, setTtsProvider] = useState('mock')
  const [availableProviders, setAvailableProviders] = useState<string[]>(['mock'])
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
  const prefSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const themeInitializedRef = useRef(false)
  const listeningStartMsRef = useRef(0)
  const speechStartListeningRef = useRef<(lang?: string) => Promise<boolean>>(() => Promise.resolve(false))
  const speechCancelListeningRef = useRef<() => void | Promise<void>>(() => undefined)
  const endpointRequestRef = useRef(0)
  const sessionActiveRef = useRef(false)
  const canListenOnRouteRef = useRef(true)
  const playbackActiveRef = useRef(false)
  const audioPlayingRef = useRef(false)
  const playbackStartedRef = useRef(false)
  const playbackEndedAtMsRef = useRef<number | null>(null)
  const pendingNativeTranscriptRef = useRef('')
  const isCorrectionPlayingRef = useRef(false)
  const resumeListeningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scenario = scenarios.find(item => item.key === selectedScenarioKey) ?? scenarios[0]
  const accent = accentProfiles.find(item => item.key === selectedAccentKey) ?? accentProfiles[0]
  const providerVoiceProfiles = voiceProfiles.filter(profile => profile.provider === ttsProvider)
  const selectedVoiceProfile = voiceProfiles.find(profile => profile.id === selectedVoiceProfileId)
    ?? providerVoiceProfiles.find(profile => profile.providerVoiceId === ttsVoiceId)
    ?? providerVoiceProfiles.find(profile => profile.status === 'active')
  const sessionAccentName = selectedVoiceProfile?.accentLabel ?? getAccentLabel(accent, locale)
  const sessionAccentRegion = selectedVoiceProfile?.accentRegion ?? getAccentRegion(accent, locale)
  const api = useMemo(() => createMeteorVoiceApiClient({
    baseUrl: apiBaseUrl.trim(),
    headers: getAuthHeaders,
  }), [apiBaseUrl, getAuthHeaders])
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
  const tr = useCallback((key: string) => t[locale]?.[key] ?? t.en[key] ?? key, [locale])

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
      if (updateStatus) setStatus('session.status.listening')
      void speechStartListeningRef.current('en-US')
    }, delayMs)
  }, [clearResumeListeningTimer, logVoiceMetric])

  useEffect(() => clearResumeListeningTimer, [clearResumeListeningTimer])

  const updateApiBaseUrl = useCallback((value: string) => {
    setApiBaseUrl(value)
    const normalized = value.trim()
    if (!normalized || normalized === defaultApiBaseUrl) {
      void SecureStore.deleteItemAsync(apiBaseUrlStorageKey)
      return
    }
    void SecureStore.setItemAsync(apiBaseUrlStorageKey, normalized)
  }, [])

  function startSession() {
    logVoiceMetric('session_start', { scenario: scenario.key, accent: accent.key, provider: ttsProvider })
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
    setSnapshot(nextSnapshot)
    setMessages([])
    setCorrectionHistory([])
    setAudioUrl(null)
    playbackEndedAtMsRef.current = null
    setPlaybackQueue(createPlaybackQueueSnapshot())
    setSummary(null)
    setIsSessionActive(true)
    setStatus('session.status.listening')
    void speechStartListeningRef.current('en-US')
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
    if (
      busy ||
      audio.isRecording ||
      playbackActiveRef.current ||
      !canAcceptUserTranscript({
        activeSession: isSessionActive,
        canListenOnRoute: canListenOnRouteRef.current,
        workflowState: snapshot.state,
        transcript,
      })
    ) return

    const acceptedTurn = acceptTranscriptTurn({ snapshot, transcript, messages })
    const nextMessages = acceptedTurn.messages
    let nextSnapshot = acceptedTurn.snapshot
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

    try {
      setStatus('session.status.requesting_reply')
      nextSnapshot = requestCoachReply(nextSnapshot)
      setSnapshot(nextSnapshot)
      const coachReply = await api.generateCoachReply({
        messages: nextMessages,
        context: {
          scenario: { name: scenario.name, description: scenario.description },
          accentProfile: { name: accent.name, region: accent.region },
          sessionId: nextSnapshot.sessionId,
          turnNumber: nextMessages.filter(message => message.role === 'user').length,
        },
      })
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
      setMessages(coachTurn.messages)
      setSnapshot(nextSnapshot)

      setStatus('session.status.requesting_voice')
      if (!coachReply.text.trim()) {
        setStatus('session.status.reply_without_text')
        return
      }
      const voice = await synthesizeCoachSpeech(coachReply.text)
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
      }
      const completedTurn = completeCoachPlayback({
        snapshot: nextSnapshot,
        corrections: coachReply.corrections,
      })
      setSnapshot(completedTurn.snapshot)
    } catch (error) {
      const recovery = recoverSessionError({
        snapshot: nextSnapshot,
        reason: 'coach_reply_failed',
        activeSession: isSessionActive,
        canListenOnRoute: canListenOnRouteRef.current,
      })
      setSnapshot(recovery.snapshot)
      const message = error instanceof MeteorVoiceApiError
        ? `${error.message} (${error.status})`
        : error instanceof Error
          ? error.message
          : 'Request failed'
      setStatus(message)
    } finally {
      setBusy(false)
    }
  }, [
    accent.name, accent.region, api, audio.isRecording, busy, clearResumeListeningTimer, isSessionActive,
    logVoiceMetric, messages, scenario.description, scenario.name, snapshot, synthesizeCoachSpeech,
  ])

  const handleNativeFinalTranscript = useCallback(async (finalTranscript: string) => {
    const finalReceivedAt = Date.now()
    const transcript = finalTranscript.trim()
    if (!transcript) return
    const endpointTranscript = [pendingNativeTranscriptRef.current, transcript]
      .map(part => part.trim())
      .filter(Boolean)
      .join(' ')

    if (!isSessionActive) {
      logVoiceMetric('transcript_ignored_inactive', { chars: transcript.length })
      setStatus('session.status.speech_captured')
      return
    }

    const transcriptGate = gateUserTranscript({
      activeSession: sessionActiveRef.current,
      canListenOnRoute: canListenOnRouteRef.current,
      workflowState: snapshot.state,
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
      lastAssistantResponse: snapshot.lastResponse,
      playbackEndedAtMs: playbackEndedAtMsRef.current,
      nowMs: Date.now(),
    })
    if (echoGuard.shouldIgnore) {
      logVoiceMetric('transcript_echo_ignored', {
        overlapRatio: echoGuard.overlapRatio,
        chars: endpointTranscript.length,
      })
      pendingNativeTranscriptRef.current = ''
      setStatus('session.status.listening')
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
      messages,
      scenario: scenario.key,
      semanticCheck: auth.state === 'signed-in' ? async (t, ctx) => {
        const res = await fetch(`${baseUrl}/api/semantic-endpoint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-MeteorVoice-Client': 'meteorvoice-mobile', ...getAuthHeaders() },
          body: JSON.stringify({ transcript: t, messages: ctx.messages, scenario: ctx.scenario }),
        })
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
      setStatus('session.status.listening')
      if (!playbackActiveRef.current && !audioPlayingRef.current) {
        void speechStartListeningRef.current('en-US')
      }
      return
    }

    pendingNativeTranscriptRef.current = ''
    logVoiceMetric('submit_turn_start', { chars: endpointTranscript.length })
    void submitTurn(endpointTranscript)
  }, [apiBaseUrl, audio.isPlaying, auth.state, getAuthHeaders, isSessionActive, logVoiceMetric, messages, scenario.key, snapshot.lastResponse, snapshot.state, submitTurn])

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

  const speech = useNativeSpeech({
    onFinalTranscript: handleNativeFinalTranscript,
    onListeningEndedWithoutTranscript: handleListeningEndedWithoutTranscript,
    onMetric: logVoiceMetric,
  })

  useEffect(() => {
    speechStartListeningRef.current = speech.startListening
    speechCancelListeningRef.current = speech.cancelListening
  }, [speech.cancelListening, speech.startListening])

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
      setStatus('session.status.listening')
      void speechStartListeningRef.current('en-US')
    }
  }, [busy, clearResumeListeningTimer])

  async function endSession() {
    if (!canEndSession({ activeSession: isSessionActive, workflowState: snapshot.state }) || busy) return

    // 立即结束 session，不等 API
    sessionActiveRef.current = false
    canListenOnRouteRef.current = false
    playbackActiveRef.current = false
    playbackEndedAtMsRef.current = null
    clearResumeListeningTimer()
    endpointRequestRef.current += 1
    pendingNativeTranscriptRef.current = ''
    void speechCancelListeningRef.current()
    const endedSnapshot = endActiveSession(snapshot).snapshot
    setSnapshot(endedSnapshot)
    setIsSessionActive(false)
    setStatus('session.ended')

    setBusy(true)
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
    } finally {
      setBusy(false)
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

  async function loadHistory() {
    if (historyLoading) return
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const result = await api.listHistory()
      setHistorySessions(result.sessions)
      setSelectedHistory(result.sessions[0] ?? null)
      setSelectedHistoryTurns([])
    } catch (error) {
      const message = error instanceof MeteorVoiceApiError
        ? `${error.message} (${error.status})`
        : error instanceof Error ? error.message : 'History request failed'
      setHistoryError(message)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function deleteSession(id: string) {
    setHistorySessions(prev => prev.map(s => s.id === id ? { ...s, status: 'deleted' } : s))
    try {
      await fetch(`${apiBaseUrl.trim()}/api/session?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: getAuthHeaders() as Record<string, string>,
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
      const message = error instanceof MeteorVoiceApiError
        ? `${error.message} (${error.status})`
        : error instanceof Error ? error.message : 'Turn detail request failed'
      setHistoryError(message)
    }
  }

  async function loadPreferences() {
    if (settingsLoading) return
    setSettingsLoading(true)
    setSettingsMessage(null)
    try {
      const preferences = await api.getPreferences()
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
      setSettingsMessage(tr('session.status.preferences_loaded'))
    } catch (error) {
      const message = error instanceof MeteorVoiceApiError
        ? `${error.message} (${error.status})`
        : error instanceof Error ? error.message : 'Preferences request failed'
      setSettingsMessage(message)
    } finally {
      setSettingsLoading(false)
    }
  }

  async function saveProvider(provider: string) {
    setTtsProvider(provider)
    setAudioUrl(null)
    playbackEndedAtMsRef.current = null
    setSettingsLoading(true)
    setSettingsMessage(null)
    if (auth.state !== 'signed-in') {
      setSettingsMessage(tr('session.status.preferences_saved'))
      setSettingsLoading(false)
      return
    }

    try {
      const result = await api.updatePreferences({
        tts_provider: provider,
        default_scenario_key: selectedScenarioKey,
        tts_speed: ttsSpeed,
      })
      setTtsProvider(result.tts_provider)
      setTtsSpeed(result.tts_speed)
      if (result.voice_profiles) setVoiceProfiles(result.voice_profiles)
      if (result.selected_voice_profile_id !== undefined) setSelectedVoiceProfileId(result.selected_voice_profile_id)
      const profile = result.voice_profiles?.find(item => item.id === result.selected_voice_profile_id)
      if (profile) setSelectedAccentKey(profile.accentKey)
      setSettingsMessage(tr('session.status.preferences_saved'))
    } catch (error) {
      const message = error instanceof MeteorVoiceApiError
        ? `${error.message} (${error.status})`
        : error instanceof Error ? error.message : 'Preferences save failed'
      setSettingsMessage(message)
    } finally {
      setSettingsLoading(false)
    }
  }

  async function savePracticePreferences() {
    setSettingsLoading(true)
    setSettingsMessage(null)
    if (auth.state !== 'signed-in') {
      setSettingsMessage(tr('session.status.practice_defaults_saved'))
      setSettingsLoading(false)
      return
    }

    try {
      const result = await api.updatePreferences({
        tts_provider: ttsProvider,
        default_scenario_key: selectedScenarioKey,
        tts_speed: ttsSpeed,
      })
      setTtsProvider(result.tts_provider)
      setTtsSpeed(result.tts_speed)
      if (result.voice_profiles) setVoiceProfiles(result.voice_profiles)
      if (result.selected_voice_profile_id !== undefined) setSelectedVoiceProfileId(result.selected_voice_profile_id)
      setSettingsMessage(tr('session.status.practice_defaults_saved'))
    } catch (error) {
      const message = error instanceof MeteorVoiceApiError
        ? `${error.message} (${error.status})`
        : error instanceof Error ? error.message : 'Preferences save failed'
      setSettingsMessage(message)
    } finally {
      setSettingsLoading(false)
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
          ttsSpeed: next,
          ttsProvider,
          defaultScenarioKey: selectedScenarioKey,
        })
      }, 600)
      return next
    })
  }

  async function selectVoiceProfile(profile: VoiceProfile) {
    if (profile.status !== 'active') return
    setAudioUrl(null)
    playbackEndedAtMsRef.current = null
    setSelectedVoiceProfileId(profile.id)
    setTtsProvider(profile.provider)
    setTtsVoiceId(profile.providerVoiceId)
    setSelectedAccentKey(profile.accentKey)
    setSettingsMessage(null)
    if (auth.state !== 'signed-in') return

    try {
      const result = await api.updatePreferences({ selected_voice_profile_id: profile.id })
      setTtsProvider(result.tts_provider)
      setTtsVoiceId(result.tts_voice_id)
      setSelectedVoiceProfileId(result.selected_voice_profile_id)
      if (result.voice_profiles) setVoiceProfiles(result.voice_profiles)
    } catch {
      // 静默失败
    }
  }

  async function submitAuth() {
    const normalizedEmail = email.trim()
    if (!normalizedEmail || !password || auth.state === 'loading') return
    const success = await auth.submit(authMode, normalizedEmail, password)
    if (success) setPassword('')
  }

  const applyPrefs = useCallback((prefs: Awaited<ReturnType<typeof pullMobilePreferences>>) => {
    if (!prefs) return
    setTtsProvider(prefs.ttsProvider)
    setTtsSpeed(prefs.ttsSpeed)
    setAvailableProviders(prefs.availableProviders)
    setTtsVoiceId(prefs.ttsVoiceId)
    setVoiceProfiles(prefs.voiceProfiles)
    setSelectedVoiceProfileId(prefs.selectedVoiceProfileId)
    if (prefs.xunfeiVoices.length > 0) setXunfeiVoices(prefs.xunfeiVoices)
    if (prefs.defaultScenarioKey) setSelectedScenarioKey(prefs.defaultScenarioKey)
    const profile = prefs.voiceProfiles.find(item => item.id === prefs.selectedVoiceProfileId)
    if (profile) setSelectedAccentKey(profile.accentKey)
    if (prefs.locale === 'zh' || prefs.locale === 'en') setLocale(prefs.locale)
    if (prefs.uiTheme && !themeInitializedRef.current) {
      themeInitializedRef.current = true
      void SecureStore.getItemAsync('theme_set_at').then(localSetAt => {
        const serverTs = new Date(prefs.uiThemeUpdatedAt).getTime()
        const localTs = localSetAt ? new Date(localSetAt).getTime() : 0
        if (serverTs >= localTs) {
          applyThemeLocal(prefs.uiTheme as Parameters<typeof setThemeLocal>[0])
        }
      })
    }
  }, [applyThemeLocal, setLocale])

  const applyServerPreferences = useCallback((preferences: PreferencesResponse) => {
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
    if (preferences.locale === 'zh' || preferences.locale === 'en') setLocale(preferences.locale)
  }, [setLocale])

  useEffect(() => {
    void api.getPreferences()
      .then(applyServerPreferences)
      .catch(() => undefined)
  }, [api, applyServerPreferences])

  // 登录后自动拉取偏好
  useEffect(() => {
    if (auth.state !== 'signed-in') return
    void pullMobilePreferences(apiBaseUrl.trim(), auth.getAuthHeaders).then(applyPrefs)
  }, [auth.state, apiBaseUrl, auth.getAuthHeaders, applyPrefs])

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
        void pullMobilePreferences(apiBaseUrl.trim(), auth.getAuthHeaders).then(applyPrefs)
      } else {
        void api.getPreferences().then(applyServerPreferences).catch(() => undefined)
      }

      if (sessionActiveRef.current && !busy && !playbackActiveRef.current && !audioPlayingRef.current) {
        listeningStartMsRef.current = Date.now()
        setStatus('session.status.listening')
        void speechStartListeningRef.current('en-US')
      }
    })
    return () => subscription.remove()
  }, [api, apiBaseUrl, applyPrefs, applyServerPreferences, auth.getAuthHeaders, auth.state, busy, clearResumeListeningTimer])

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
            appVersion={appVersion}
            voiceMetricsText={voiceMetricsText}
            onSetLocale={l => setLocale(l as Locale)}
            onSetTheme={setTheme}
            onSaveProvider={p => void saveProvider(p)}
            onAdjustSpeed={adjustSpeed}
            onSavePracticePreferences={() => void savePracticePreferences()}
            onLoadPreferences={() => void loadPreferences()}
            onSelectVoiceProfile={profile => void selectVoiceProfile(profile)}
            onSetEmail={setEmail}
            onSetPassword={setPassword}
            onSetAuthMode={setAuthMode}
            onSubmitAuth={() => void submitAuth()}
            onSignOut={() => void auth.signOut()}
            onSetApiBaseUrl={updateApiBaseUrl}
            onClearVoiceMetrics={() => setVoiceMetrics([])}
            onShareVoiceMetrics={() => {
              void Share.share({
                title: 'MeteorVoice voice diagnostics',
                message: voiceMetricsText || 'No voice metrics yet.',
              })
            }}
          />
        )
    }
  }

  const styles = makeStyles()

  return (
    <SafeAreaView style={styles.shell}>
      <View style={styles.content}>{renderScreen()}</View>
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
