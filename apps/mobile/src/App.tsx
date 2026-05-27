import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppState,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from 'react-native'
import {
  createMeteorVoiceApiClient,
  MeteorVoiceApiError,
  type AccentDto,
  type HistorySession,
  type ScenarioDto,
  type SessionTurnDto,
} from '@meteorvoice/api-client'
import {
  acceptTranscriptTurn,
  advancePlaybackQueue,
  canAcceptUserTranscript,
  canEndSession,
  continueListening as continueListeningSnapshot,
  createPlaybackQueueSnapshot,
  createInitialSnapshot,
  endActiveSession,
  getPlaybackCompletionEffects,
  judgeEndpoint,
  receiveCoachReply,
  recoverSessionError,
  requestCoachReply,
  completeCoachPlayback,
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
} from '@meteorvoice/shared'

import * as SecureStore from 'expo-secure-store'
import { useMobileAuth } from './mobileAuth'
import { useNativeSessionAudio } from './nativeAudio'
import { useNativeSpeech } from './nativeSpeech'
import { pullMobilePreferences, syncMobilePreferences, type XunfeiVoice } from './mobilePreferences'
import { ThemeProvider, useTheme } from './ThemeProvider'
import { SessionScreen } from './screens/SessionScreen'
import { HomeScreen } from './screens/HomeScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SettingsScreen } from './screens/SettingsScreen'

const defaultApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000'
type Tab = 'session' | 'home' | 'history' | 'settings'

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
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    void SecureStore.setItemAsync('app_locale', l)
  }, [])
  const [summary, setSummary] = useState<string | null>(null)
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
  const [xunfeiVoices, setXunfeiVoices] = useState<XunfeiVoice[]>([])
  const [xunfeiVoiceCatalog, setXunfeiVoiceCatalog] = useState<XunfeiVoice[]>([])
  const [remoteScenarios, setRemoteScenarios] = useState<ScenarioDto[]>([])
  const [remoteAccents, setRemoteAccents] = useState<AccentDto[]>([])
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
  const endpointRequestRef = useRef(0)
  const sessionActiveRef = useRef(false)
  const pendingNativeTranscriptRef = useRef('')

  const scenario = scenarios.find(item => item.key === selectedScenarioKey) ?? scenarios[0]
  const accent = accentProfiles.find(item => item.key === selectedAccentKey) ?? accentProfiles[0]
  const api = useMemo(() => createMeteorVoiceApiClient({
    baseUrl: apiBaseUrl.trim(),
    headers: getAuthHeaders,
  }), [apiBaseUrl, getAuthHeaders])
  const applyThemeLocal = useCallback((k: Parameters<typeof setThemeLocal>[0]) => {
    setThemeLocal(k)
  }, [setThemeLocal])
  const setTheme = useCallback((k: Parameters<typeof setThemeLocal>[0]) => {
    setThemeLocal(k)
    void api.updatePreferences({ ui_theme: k }).catch(() => {})
  }, [setThemeLocal, api])
  const tr = useCallback((key: string) => t[locale]?.[key] ?? t.en[key] ?? key, [locale])

  function startSession() {
    listeningStartMsRef.current = Date.now()
    pendingNativeTranscriptRef.current = ''
    sessionActiveRef.current = true
    const nextSessionId = apiSessionId ?? `mobile-${Date.now()}`
    const nextSnapshot = startListeningSession(nextSessionId)
    setSnapshot(nextSnapshot)
    setMessages([])
    setCorrectionHistory([])
    setAudioUrl(null)
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
    })
  }, [accent.name, api, ttsProvider, ttsSpeedRouting.serverSpeed])

  useEffect(() => {
    if (!audioUrl || !audio.didJustFinish || audio.isPlaying) return

    let cancelled = false
    const advanceQueue = () => {
      if (cancelled) return

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
        setStatus('session.status.playing_reply')
        setAudioUrl(nextQueue.currentAudioUrl)
        return
      }

      setStatus('session.status.reply_played')
    }

    const timeout = setTimeout(advanceQueue, 0)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [audio.didJustFinish, audio.isPlaying, audioUrl, playbackQueue, tr])

  const submitTurn = useCallback(async (sourceTranscript: string) => {
    const transcript = sourceTranscript.trim()
    if (
      busy ||
      audio.isRecording ||
      !canAcceptUserTranscript({
        activeSession: isSessionActive,
        canListenOnRoute: true,
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
    pendingNativeTranscriptRef.current = ''
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

      if (voice.audioUrl) {
        setStatus('session.status.playing_reply')
        setPlaybackQueue(startPlaybackQueue(voice.audioUrl))
        setAudioUrl(voice.audioUrl)
      } else {
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
        canListenOnRoute: true,
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
    accent.name, accent.region, api, audio.isRecording, busy, isSessionActive,
    messages, scenario.description, scenario.name, snapshot, synthesizeCoachSpeech,
  ])

  const handleNativeFinalTranscript = useCallback(async (finalTranscript: string) => {
    const transcript = finalTranscript.trim()
    if (!transcript) return
    const endpointTranscript = [pendingNativeTranscriptRef.current, transcript]
      .map(part => part.trim())
      .filter(Boolean)
      .join(' ')

    if (!isSessionActive) {
      setStatus('session.status.speech_captured')
      return
    }

    const baseUrl = apiBaseUrl.trim()
    const endpointRequestId = ++endpointRequestRef.current
    const endpointResult = await judgeEndpoint({
      transcript: endpointTranscript,
      listeningDurationMs: Date.now() - listeningStartMsRef.current,
      messages,
      scenario: scenario.key,
      semanticCheck: auth.state === 'signed-in' ? async (t, ctx) => {
        const res = await fetch(`${baseUrl}/api/semantic-endpoint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ transcript: t, messages: ctx.messages, scenario: ctx.scenario }),
        })
        if (!res.ok) throw new Error('Semantic check failed')
        const data = await res.json() as { judgment: 'done' | 'thinking' }
        return data.judgment
      } : undefined,
    })
    if (endpointRequestId !== endpointRequestRef.current || !sessionActiveRef.current) return

    if (endpointResult.judgment === 'continue') {
      pendingNativeTranscriptRef.current = endpointTranscript
      setStatus('session.status.listening')
      void speechStartListeningRef.current('en-US')
      return
    }

    pendingNativeTranscriptRef.current = ''
    void submitTurn(endpointTranscript)
  }, [apiBaseUrl, auth.state, getAuthHeaders, isSessionActive, messages, scenario.key, submitTurn])

  const speech = useNativeSpeech({ onFinalTranscript: handleNativeFinalTranscript })

  useEffect(() => {
    speechStartListeningRef.current = speech.startListening
  }, [speech.startListening])

  useEffect(() => {
    sessionActiveRef.current = isSessionActive
  }, [isSessionActive])

  async function continueSession() {
    if (!isSessionActive || snapshot.state === 'session_ended') return
    const nextSnapshot = continueListeningSnapshot(snapshot)
    setSnapshot(nextSnapshot)
    setStatus('session.status.listening')
  }

  async function endSession() {
    if (!canEndSession({ activeSession: isSessionActive, workflowState: snapshot.state }) || busy) return

    // 立即结束 session，不等 API
    sessionActiveRef.current = false
    endpointRequestRef.current += 1
    pendingNativeTranscriptRef.current = ''
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

  function selectAccent(key: string) {
    setSelectedAccentKey(key)
    setAudioUrl(null)
    setPlaybackQueue(createPlaybackQueueSnapshot())
    setStatus('session.status.accent_selected')
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
      if (preferences.xunfei_voices?.configured) setXunfeiVoices(preferences.xunfei_voices.configured)
      if (preferences.xunfei_voices?.catalog) setXunfeiVoiceCatalog(preferences.xunfei_voices.catalog)
      if (preferences.default_scenario_key) setSelectedScenarioKey(preferences.default_scenario_key)
      if (preferences.default_accent_key) setSelectedAccentKey(preferences.default_accent_key)
      const [scenarioResult, accentResult] = await Promise.all([
        api.listScenarios(preferences.locale ?? 'en'),
        api.listAccents({ locale: preferences.locale ?? 'en', provider: preferences.tts_provider ?? 'mock' }),
      ])
      setRemoteScenarios(scenarioResult.scenarios)
      setRemoteAccents(accentResult.accents)
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
    setSettingsLoading(true)
    setSettingsMessage(null)
    try {
      const result = await api.updatePreferences({
        tts_provider: provider,
        default_scenario_key: selectedScenarioKey,
        default_accent_key: selectedAccentKey,
        tts_speed: ttsSpeed,
      })
      setTtsProvider(result.tts_provider)
      setTtsSpeed(result.tts_speed)
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
    try {
      const result = await api.updatePreferences({
        tts_provider: ttsProvider,
        default_scenario_key: selectedScenarioKey,
        default_accent_key: selectedAccentKey,
        tts_speed: ttsSpeed,
      })
      setTtsProvider(result.tts_provider)
      setTtsSpeed(result.tts_speed)
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
          defaultAccentKey: selectedAccentKey,
        })
      }, 600)
      return next
    })
  }

  async function selectVoice(voiceId: string) {
    setTtsVoiceId(voiceId)
    try {
      await api.updatePreferences({ tts_voice_id: voiceId })
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
    if (prefs.xunfeiVoices.length > 0) setXunfeiVoices(prefs.xunfeiVoices)
    if (prefs.xunfeiVoiceCatalog.length > 0) setXunfeiVoiceCatalog(prefs.xunfeiVoiceCatalog)
    if (prefs.defaultScenarioKey) setSelectedScenarioKey(prefs.defaultScenarioKey)
    if (prefs.defaultAccentKey) setSelectedAccentKey(prefs.defaultAccentKey)
    if (prefs.locale === 'zh' || prefs.locale === 'en') setLocale(prefs.locale)
    if (prefs.uiTheme && !themeInitializedRef.current) {
      themeInitializedRef.current = true
      applyThemeLocal(prefs.uiTheme as Parameters<typeof setThemeLocal>[0])
    }
  }, [applyThemeLocal])

  // 登录后自动拉取偏好
  useEffect(() => {
    if (auth.state !== 'signed-in') return
    void pullMobilePreferences(apiBaseUrl.trim(), auth.getAuthHeaders).then(applyPrefs)
  }, [auth.state, apiBaseUrl, auth.getAuthHeaders, applyPrefs])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState !== 'active') return
      void pullMobilePreferences(apiBaseUrl.trim(), auth.getAuthHeaders).then(applyPrefs)
    })
    return () => subscription.remove()
  }, [apiBaseUrl, auth.getAuthHeaders, applyPrefs])

  function playCorrection(text: string) {
    void synthesizeCoachSpeech(text).then(voice => {
      if (voice.audioUrl) setAudioUrl(voice.audioUrl)
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
            accentName={getAccentLabel(accent, locale)}
            accentRegion={getAccentRegion(accent, locale)}
            onStart={startSession}
            onEnd={() => void endSession()}
            onPlayCorrection={playCorrection}
          />
        )
      case 'home':
        return (
          <HomeScreen
            tr={tr}
            locale={locale}
            scenarios={scenarios}
            remoteScenarios={remoteScenarios}
            selectedScenarioKey={selectedScenarioKey}
            isSessionActive={isSessionActive}
            onSelectScenario={selectScenario}
            onGoToSession={() => setActiveTab('session')}
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
            xunfeiVoices={xunfeiVoices}
            xunfeiVoiceCatalog={xunfeiVoiceCatalog}
            remoteAccents={remoteAccents}
            remoteScenarios={remoteScenarios}
            accentProfiles={accentProfiles}
            selectedAccentKey={selectedAccentKey}
            settingsLoading={settingsLoading}
            settingsMessage={settingsMessage}
            auth={auth}
            email={email}
            password={password}
            authMode={authMode}
            apiBaseUrl={apiBaseUrl}
            onSetLocale={l => setLocale(l as Locale)}
            onSetTheme={setTheme}
            onSaveProvider={p => void saveProvider(p)}
            onAdjustSpeed={adjustSpeed}
            onSavePracticePreferences={() => void savePracticePreferences()}
            onLoadPreferences={() => void loadPreferences()}
            onSelectAccent={selectAccent}
            onSelectVoice={id => void selectVoice(id)}
            onSetEmail={setEmail}
            onSetPassword={setPassword}
            onSetAuthMode={setAuthMode}
            onSubmitAuth={() => void submitAuth()}
            onSignOut={() => void auth.signOut()}
            onSetApiBaseUrl={setApiBaseUrl}
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
            <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}>
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

