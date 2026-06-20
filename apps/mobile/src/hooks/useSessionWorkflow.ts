import { useCallback, type Dispatch, type SetStateAction } from 'react'
import {
  acceptTranscriptTurn,
  canAcceptUserTranscript,
  canEndSession,
  createPlaybackQueueSnapshot,
  endActiveSession,
  gateUserTranscript,
  judgeEndpoint,
  receiveCoachReply,
  recoverSessionError,
  requestCoachReply,
  completeCoachPlayback,
  shouldIgnoreLikelyPlaybackEcho,
  startListeningSession,
  startPlaybackQueue,
  DEFAULT_PLAYBACK_COOLDOWN_MS,
  type WorkflowSnapshot,
} from '@meteorvoice/session-core'
import { formatApiRequestError, fetchWithTimeout } from '@meteorvoice/api-client'
import {
  displayErrorFeedback,
  type ConversationMessage,
  type ConversationResponse,
} from '@meteorvoice/shared'
import {
  shouldResumeListening,
  withTimeout,
  type SessionSttProvider,
  type SessionRoutePresence,
} from '../sessionRuntime'
import { canApplyEndpointResult, classifyRequestTerminalStage, isTurnStale } from '../sessionTurnRuntime'

export interface SessionWorkflowDeps {
  api: {
    generateCoachReply: (params: unknown) => Promise<{ text: string; corrections: ConversationResponse['corrections'] }>
    synthesizeSpeech: (params: unknown) => Promise<{ audioUrl: string; duration?: number }>
    generateSummary: (params: unknown) => Promise<{ summary: string }>
    syncSession: (params: unknown) => Promise<unknown>
  }
  getAuthHeaders: () => Promise<Record<string, string>>
  handleUnauthorized: () => void
  apiBaseUrl: string
  accent: { name: string; region: string }
  scenario: { key: string; name: string; description: string; icon: string }
  ttsProvider: string
  ttsSpeedRouting: { serverSpeed: number }
  ttsVoiceId: string | null
  isSessionActive: boolean
  authState: string
  audio: {
    isPlaying: boolean
    isRecording: boolean
    didJustFinish: boolean
  }
  // State setters
  setSnapshot: Dispatch<SetStateAction<WorkflowSnapshot>>
  setMessages: Dispatch<SetStateAction<ConversationMessage[]>>
  setCorrectionHistory: Dispatch<SetStateAction<ConversationResponse['corrections']>>
  setAudioUrl: Dispatch<SetStateAction<string | null>>
  setPlaybackQueue: Dispatch<SetStateAction<ReturnType<typeof createPlaybackQueueSnapshot>>>
  setIsSessionActive: Dispatch<SetStateAction<boolean>>
  setStatus: (status: string) => void
  setBusy: (busy: boolean) => void
  setSummary: Dispatch<SetStateAction<string | null>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setActiveTab: Dispatch<SetStateAction<any>>
  setScenarioSwitching: Dispatch<SetStateAction<boolean>>
  setSelectedScenarioKey: Dispatch<SetStateAction<string>>
  // Ref setters
  snapshotRef: React.MutableRefObject<WorkflowSnapshot>
  messagesRef: React.MutableRefObject<ConversationMessage[]>
  sessionActiveRef: React.MutableRefObject<boolean>
  busyRef: React.MutableRefObject<boolean>
  playbackActiveRef: React.MutableRefObject<boolean>
  audioPlayingRef: React.MutableRefObject<boolean>
  playbackStartedRef: React.MutableRefObject<boolean>
  playbackEndedAtMsRef: React.MutableRefObject<number | null>
  pendingNativeTranscriptRef: React.MutableRefObject<string>
  endpointRequestRef: React.MutableRefObject<number>
  turnRequestRef: React.MutableRefObject<number>
  sessionGenerationRef: React.MutableRefObject<number>
  sttRestartCountRef: React.MutableRefObject<number>
  sttRestartStartMsRef: React.MutableRefObject<number>
  listeningStartMsRef: React.MutableRefObject<number>
  listeningTeardownRef: React.MutableRefObject<Promise<void> | null>
  canListenOnRouteRef: React.MutableRefObject<boolean>
  routePresenceRef: React.MutableRefObject<SessionRoutePresence>
  activeTabRef: React.MutableRefObject<string>
  selectedScenarioKeyRef: React.MutableRefObject<string>
  localeRef: React.MutableRefObject<string>
  sttPrewarmAudioUrlRef: React.MutableRefObject<string | null>
  // Voice metrics
  logVoiceMetric: (stage: string, data?: Record<string, unknown>) => void
  logUserAction: (action: string, data?: Record<string, unknown>) => void
  setRoutePresence: (next: SessionRoutePresence, reason: string) => void
  canStartSessionListening: (context: string, generation?: number) => boolean
  cancelListeningForReason: (reason: string) => Promise<void>
  waitForListeningTeardown: (context: string) => Promise<void>
  scheduleResumeListening: (delayMs?: number, updateStatus?: boolean) => void
  clearResumeListeningTimer: () => void
  listeningStartupStatus: (provider?: SessionSttProvider) => string
  // Audio controls
  audioStopPlayback: () => void
  // STT
  startListeningWithProviderRef: React.MutableRefObject<(provider: SessionSttProvider, lang?: string) => Promise<boolean>>
  speechStartListeningRef: React.MutableRefObject<(lang?: string) => Promise<boolean>>
  nativeSpeechStartListeningRef: React.MutableRefObject<(lang?: string) => Promise<boolean>>
  // Scenario
  scenarioSwitching: boolean
  apiSessionId: string | null
  correctionHistory: ConversationResponse['corrections']
}

export interface SessionWorkflowReturn {
  startSession: (sttProvider?: SessionSttProvider) => Promise<void>
  synthesizeCoachSpeech: (text: string) => Promise<{ audioUrl: string; duration?: number }>
  submitTurn: (sourceTranscript: string) => Promise<void>
  handleNativeFinalTranscript: (finalTranscript: string) => Promise<void>
  handleListeningEndedWithoutTranscript: () => void
  endSession: () => Promise<void>
  selectScenario: (key: string) => Promise<boolean>
  playCorrection: (text: string) => void
}

export function useSessionWorkflow(deps: SessionWorkflowDeps): SessionWorkflowReturn {
  const {
    api, getAuthHeaders, handleUnauthorized, apiBaseUrl,
    accent, scenario, ttsProvider, ttsSpeedRouting, ttsVoiceId,
    isSessionActive, authState, audio,
    setSnapshot, setMessages, setCorrectionHistory, setAudioUrl, setPlaybackQueue,
    setIsSessionActive, setStatus, setBusy, setSummary, setActiveTab,
    setScenarioSwitching, setSelectedScenarioKey,
    snapshotRef, messagesRef, sessionActiveRef, busyRef,
    playbackActiveRef, audioPlayingRef, playbackStartedRef, playbackEndedAtMsRef,
    pendingNativeTranscriptRef, endpointRequestRef, turnRequestRef, sessionGenerationRef,
    sttRestartCountRef, sttRestartStartMsRef, listeningStartMsRef,
    listeningTeardownRef, canListenOnRouteRef, routePresenceRef,
    activeTabRef, selectedScenarioKeyRef, localeRef,
    logVoiceMetric, logUserAction, setRoutePresence, canStartSessionListening,
    cancelListeningForReason, waitForListeningTeardown,
    scheduleResumeListening, clearResumeListeningTimer, listeningStartupStatus,
    audioStopPlayback, startListeningWithProviderRef, speechStartListeningRef,
    nativeSpeechStartListeningRef, scenarioSwitching,
    apiSessionId, correctionHistory,
  } = deps

  const synthesizeCoachSpeech = useCallback(async (text: string) => {
    return api.synthesizeSpeech({
      text,
      accent: accent.name,
      provider: ttsProvider,
      speed: ttsSpeedRouting.serverSpeed,
      voiceId: ttsVoiceId ?? undefined,
    })
  }, [accent.name, api, ttsProvider, ttsSpeedRouting.serverSpeed, ttsVoiceId])

  const startSession = useCallback(async (sttProvider?: SessionSttProvider) => {
    logUserAction('session_start_tap', { scenario: scenario.key })
    if (scenarioSwitching) {
      logVoiceMetric('session_start_blocked', { reason: 'scenario_switching' })
      return
    }
    if (authState !== 'signed-in') {
      setActiveTab('settings')
      setStatus('login.signin')
      return
    }

    setStatus('session.status.preparing_listening')
    logVoiceMetric('session_start_requested', {
      scenario: scenario.key,
      activeTab: activeTabRef.current,
      pendingTeardown: Boolean(listeningTeardownRef.current),
    })
    await waitForListeningTeardown('session_start')
    await cancelListeningForReason('session_start_reset')
    const listeningProvider: SessionSttProvider = sttProvider ?? 'native'
    logVoiceMetric('session_start', {
      scenario: scenario.key, accent: accent.name,
      provider: ttsProvider, sttProvider: listeningProvider,
    })
    endpointRequestRef.current += 1
    sessionGenerationRef.current += 1
    sttRestartCountRef.current = 0
    sttRestartStartMsRef.current = 0
    clearResumeListeningTimer()
    playbackActiveRef.current = false
    playbackStartedRef.current = false
    playbackEndedAtMsRef.current = null
    listeningStartMsRef.current = Date.now()
    pendingNativeTranscriptRef.current = ''
    sessionActiveRef.current = true
    setRoutePresence('inSession', 'session_start')
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
    logVoiceMetric('session_listening_start_requested', {
      sttProvider: listeningProvider,
      sessionId: nextSessionId,
      canListenOnRoute: canListenOnRouteRef.current,
    })
    void startListeningWithProviderRef.current(listeningProvider, 'en-US')
  }, [
    logUserAction, scenario, scenarioSwitching, logVoiceMetric, authState, setActiveTab, setStatus,
    activeTabRef, listeningTeardownRef, waitForListeningTeardown, cancelListeningForReason,
    ttsProvider, endpointRequestRef, sessionGenerationRef, sttRestartCountRef, sttRestartStartMsRef,
    clearResumeListeningTimer, playbackActiveRef, playbackStartedRef, playbackEndedAtMsRef,
    listeningStartMsRef, pendingNativeTranscriptRef, sessionActiveRef, setRoutePresence,
    apiSessionId, snapshotRef, messagesRef, setSnapshot, setMessages, setCorrectionHistory,
    setAudioUrl, setPlaybackQueue, setSummary, setIsSessionActive, listeningStartupStatus,
    canListenOnRouteRef, startListeningWithProviderRef, accent.name,
  ])

  const submitTurn = useCallback(async (sourceTranscript: string) => {
    const submitStartedAt = Date.now()
    const submitGeneration = sessionGenerationRef.current
    const transcript = sourceTranscript.trim()
    const currentSnapshot = snapshotRef.current
    const currentMessages = messagesRef.current
    if (
      busyRef.current ||
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
    await cancelListeningForReason('submit_turn')
    setBusy(true)
    const turnRequestId = ++turnRequestRef.current
    let terminalLogged = false

    const logSubmitTerminal = (stage: string, data: Record<string, unknown> = {}) => {
      terminalLogged = true
      logVoiceMetric(stage, {
        turnRequestId, generation: submitGeneration,
        elapsedMs: Date.now() - submitStartedAt, ...data,
      })
    }

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
          turnNumber: nextMessages.filter(m => m.role === 'user').length,
          responseLocale: localeRef.current,
        },
      }), 20_000, 'Coach reply request timed out.')
      if (isTurnStale({
        turnRequestId,
        currentTurnRequestId: turnRequestRef.current,
        generation: submitGeneration,
        currentGeneration: sessionGenerationRef.current,
        sessionActive: sessionActiveRef.current,
      })) {
        logSubmitTerminal('submit_turn_ignored_stale', { reason: 'coach_reply_stale' })
        return
      }
      logVoiceMetric('coach_reply_ready', {
        elapsedMs: Date.now() - submitStartedAt, chars: coachReply.text.length,
      })
      setCorrectionHistory(previous => [...previous, ...coachReply.corrections])
      const coachTurn = receiveCoachReply({
        snapshot: nextSnapshot, messages: nextMessages,
        responseText: coachReply.text, corrections: coachReply.corrections,
      })
      nextSnapshot = coachTurn.snapshot
      snapshotRef.current = nextSnapshot
      messagesRef.current = coachTurn.messages
      setMessages(coachTurn.messages)
      setSnapshot(nextSnapshot)

      setStatus('session.status.requesting_voice')
      if (!coachReply.text.trim()) {
        setStatus('session.status.reply_without_text')
        const resumeGate = {
          sessionActive: sessionActiveRef.current,
          routePresence: routePresenceRef.current,
          canListenOnRoute: canListenOnRouteRef.current,
          busy: false,
          playbackActive: playbackActiveRef.current,
          audioPlaying: audioPlayingRef.current,
          generation: submitGeneration,
          currentGeneration: sessionGenerationRef.current,
        }
        if (shouldResumeListening(resumeGate)) scheduleResumeListening(500)
        logSubmitTerminal('submit_turn_done', { reason: 'reply_without_text' })
        return
      }
      const voice = await withTimeout(synthesizeCoachSpeech(coachReply.text), 20_000, 'Coach voice request timed out.')
      if (isTurnStale({
        turnRequestId, currentTurnRequestId: turnRequestRef.current,
        generation: submitGeneration, currentGeneration: sessionGenerationRef.current,
        sessionActive: sessionActiveRef.current,
      })) {
        logSubmitTerminal('submit_turn_ignored_stale', { reason: 'tts_stale' })
        return
      }
      logVoiceMetric('tts_ready', {
        elapsedMs: Date.now() - submitStartedAt, hasAudio: Boolean(voice.audioUrl),
      })

      if (voice.audioUrl) {
        playbackActiveRef.current = true
        playbackStartedRef.current = false
        playbackEndedAtMsRef.current = null
        clearResumeListeningTimer()
        await cancelListeningForReason('playback_enqueue')
        setStatus('session.status.playing_reply')
        setPlaybackQueue(startPlaybackQueue(voice.audioUrl))
        setAudioUrl(voice.audioUrl)
        logVoiceMetric('playback_enqueued', { elapsedMs: Date.now() - submitStartedAt })
      } else {
        playbackActiveRef.current = false
        setStatus('session.status.reply_without_audio')
        const resumeGate = {
          sessionActive: sessionActiveRef.current,
          routePresence: routePresenceRef.current,
          canListenOnRoute: canListenOnRouteRef.current,
          busy: false,
          playbackActive: playbackActiveRef.current,
          audioPlaying: audioPlayingRef.current,
          generation: submitGeneration,
          currentGeneration: sessionGenerationRef.current,
        }
        if (shouldResumeListening(resumeGate)) scheduleResumeListening(500)
      }
      const completedTurn = completeCoachPlayback({
        snapshot: nextSnapshot, corrections: coachReply.corrections,
      })
      snapshotRef.current = completedTurn.snapshot
      setSnapshot(completedTurn.snapshot)
      logSubmitTerminal('submit_turn_done', { hasAudio: Boolean(voice.audioUrl) })
    } catch (error) {
      const terminal = classifyRequestTerminalStage(error)
      logSubmitTerminal(terminal.stage, { message: terminal.message })
      const recovery = recoverSessionError({
        snapshot: nextSnapshot, reason: 'coach_reply_failed',
        activeSession: isSessionActive, canListenOnRoute: canListenOnRouteRef.current,
      })
      snapshotRef.current = recovery.snapshot
      setSnapshot(recovery.snapshot)
      const requestError = formatApiRequestError(error, {
        context: 'mobile_session_submit', presentation: 'banner',
      })
      logVoiceMetric('mobile_session_request_error', requestError.logData)
      displayErrorFeedback(requestError, 'mobile_session_submit')
      setStatus(requestError.displayMessage)
      const resumeGate = {
        sessionActive: sessionActiveRef.current,
        routePresence: routePresenceRef.current,
        canListenOnRoute: canListenOnRouteRef.current,
        busy: false,
        playbackActive: playbackActiveRef.current,
        audioPlaying: audioPlayingRef.current,
        generation: submitGeneration,
        currentGeneration: sessionGenerationRef.current,
      }
      if (shouldResumeListening(resumeGate)) scheduleResumeListening(900)
    } finally {
      if (turnRequestRef.current === turnRequestId) setBusy(false)
      if (!terminalLogged) {
        logVoiceMetric('submit_turn_finally_without_terminal', {
          turnRequestId, generation: submitGeneration,
          elapsedMs: Date.now() - submitStartedAt,
        })
      }
    }
  }, [
    accent, api, audio.isRecording, busyRef, cancelListeningForReason,
    clearResumeListeningTimer, isSessionActive, logVoiceMetric, scenario,
    scheduleResumeListening, setBusy, setStatus, synthesizeCoachSpeech,
    snapshotRef, messagesRef, sessionGenerationRef, playbackActiveRef,
    canListenOnRouteRef, setSnapshot, setMessages, setAudioUrl, setPlaybackQueue,
    setCorrectionHistory, listeningStartMsRef, playbackEndedAtMsRef,
    pendingNativeTranscriptRef, turnRequestRef, sessionActiveRef, routePresenceRef,
    audioPlayingRef, localeRef,
  ])

  const handleNativeFinalTranscript = useCallback(async (finalTranscript: string) => {
    const finalReceivedAt = Date.now()
    const transcript = finalTranscript.trim()
    if (!transcript) return
    const endpointTranscript = [pendingNativeTranscriptRef.current, transcript]
      .map(part => part.trim()).filter(Boolean).join(' ')

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
        reason: transcriptGate.reason, chars: endpointTranscript.length,
      })
      if (transcriptGate.reason === 'playback_active') {
        void cancelListeningForReason('transcript_gate_playback_active')
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
        overlapRatio: echoGuard.overlapRatio, chars: endpointTranscript.length,
      })
      pendingNativeTranscriptRef.current = ''
      setStatus(listeningStartupStatus())
      const resumeGate = {
        sessionActive: sessionActiveRef.current,
        routePresence: routePresenceRef.current,
        canListenOnRoute: canListenOnRouteRef.current,
        busy: busyRef.current,
        playbackActive: playbackActiveRef.current,
        audioPlaying: audioPlayingRef.current,
      }
      if (shouldResumeListening(resumeGate)) {
        void speechStartListeningRef.current('en-US')
      }
      return
    }

    const baseUrl = apiBaseUrl.trim()
    const endpointRequestId = ++endpointRequestRef.current
    logVoiceMetric('endpoint_start', { chars: endpointTranscript.length })
    let endpointResult: Awaited<ReturnType<typeof judgeEndpoint>>
    try {
      endpointResult = await judgeEndpoint({
        transcript: endpointTranscript,
        listeningDurationMs: Date.now() - listeningStartMsRef.current,
        messages: currentMessages,
        scenario: scenario.key,
        semanticCheck: authState === 'signed-in' ? async (t, ctx) => {
          const authHeaders = await getAuthHeaders()
          const res = await fetchWithTimeout(fetch, `${baseUrl}/api/semantic-endpoint`, {
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
    } catch (error) {
      logVoiceMetric('endpoint_error', {
        chars: endpointTranscript.length,
        elapsedMs: Date.now() - finalReceivedAt,
        message: error instanceof Error ? error.message : 'Endpoint judgment failed',
      })
      pendingNativeTranscriptRef.current = endpointTranscript
      setStatus(listeningStartupStatus())
      const resumeGate = {
        sessionActive: sessionActiveRef.current,
        routePresence: routePresenceRef.current,
        canListenOnRoute: canListenOnRouteRef.current,
        busy: busyRef.current,
        playbackActive: playbackActiveRef.current,
        audioPlaying: audioPlayingRef.current,
      }
      if (shouldResumeListening(resumeGate)) {
        void speechStartListeningRef.current('en-US')
      }
      return
    }
    if (!canApplyEndpointResult({
      endpointRequestId, currentEndpointRequestId: endpointRequestRef.current,
      sessionActive: sessionActiveRef.current,
      canListenOnRoute: canListenOnRouteRef.current,
      playbackActive: playbackActiveRef.current,
    })) {
      logVoiceMetric('endpoint_ignored_stale', {
        endpointRequestId, currentEndpointRequestId: endpointRequestRef.current,
        sessionActive: sessionActiveRef.current,
        canListenOnRoute: canListenOnRouteRef.current,
        playbackActive: playbackActiveRef.current,
      })
      return
    }
    logVoiceMetric('endpoint_done', {
      judgment: endpointResult.judgment, reason: endpointResult.reason,
      elapsedMs: Date.now() - finalReceivedAt,
    })

    if (endpointResult.judgment === 'continue') {
      pendingNativeTranscriptRef.current = endpointTranscript
      setStatus(listeningStartupStatus())
      const resumeGate = {
        sessionActive: sessionActiveRef.current,
        routePresence: routePresenceRef.current,
        canListenOnRoute: canListenOnRouteRef.current,
        busy: busyRef.current,
        playbackActive: playbackActiveRef.current,
        audioPlaying: audioPlayingRef.current,
      }
      if (shouldResumeListening(resumeGate)) {
        void speechStartListeningRef.current('en-US')
      }
      return
    }

    pendingNativeTranscriptRef.current = ''
    logVoiceMetric('submit_turn_start', { chars: endpointTranscript.length })
    void submitTurn(endpointTranscript)
  }, [
    apiBaseUrl, audio.isPlaying, authState, cancelListeningForReason, getAuthHeaders, handleUnauthorized,
    listeningStartupStatus, logVoiceMetric, scenario.key, setStatus, submitTurn,
    snapshotRef, messagesRef, sessionActiveRef, canListenOnRouteRef, playbackActiveRef,
    playbackEndedAtMsRef, busyRef, audioPlayingRef, endpointRequestRef,
    pendingNativeTranscriptRef, listeningStartMsRef, speechStartListeningRef,
  ])

  const handleListeningEndedWithoutTranscript = useCallback(() => {
    const resumeGate = {
      sessionActive: sessionActiveRef.current,
      routePresence: routePresenceRef.current,
      canListenOnRoute: canListenOnRouteRef.current,
      busy: busyRef.current,
      playbackActive: playbackActiveRef.current,
      audioPlaying: audioPlayingRef.current,
    }
    if (!shouldResumeListening(resumeGate)) {
      logVoiceMetric('stt_end_restart_skipped', {
        sessionActive: sessionActiveRef.current,
        routePresence: routePresenceRef.current,
        canListenOnRoute: canListenOnRouteRef.current,
        activeTab: activeTabRef.current,
        busy: busyRef.current,
        playbackActive: playbackActiveRef.current,
        audioPlaying: audioPlayingRef.current,
        provider: 'native',
      })
      return
    }

    sttRestartCountRef.current += 1
    const consecutive = sttRestartCountRef.current
    const STT_MAX_CONSECUTIVE_RESTARTS = 5
    if (consecutive > STT_MAX_CONSECUTIVE_RESTARTS) {
      const totalElapsed = sttRestartStartMsRef.current
        ? Date.now() - sttRestartStartMsRef.current : 0
      logVoiceMetric('stt_restart_circuit_open', {
        restartCount: consecutive, totalElapsedMs: totalElapsed,
        provider: 'native',
      })
      sttRestartCountRef.current = 0
      sttRestartStartMsRef.current = 0
      void nativeSpeechStartListeningRef.current('en-US')
      return
    }

    if (consecutive === 1) sttRestartStartMsRef.current = Date.now()
    const backoffMs = Math.min(250 * Math.pow(2, consecutive - 1), 8000)
    logVoiceMetric('stt_end_restart_scheduled', { restartCount: consecutive, backoffMs })
    scheduleResumeListening(backoffMs, false)
  }, [logVoiceMetric, scheduleResumeListening,
    sessionActiveRef, routePresenceRef, canListenOnRouteRef, busyRef,
    playbackActiveRef, audioPlayingRef, activeTabRef,
    sttRestartCountRef, sttRestartStartMsRef])

  const endSession = useCallback(async () => {
    logUserAction('session_stop_tap')
    const snapshot = snapshotRef.current
    if (!canEndSession({ activeSession: isSessionActive, workflowState: snapshot.state })) return
    logVoiceMetric('session_end_requested', {
      sessionId: snapshot.sessionId, state: snapshot.state,
      messages: messagesRef.current.length, activeTab: activeTabRef.current,
      pendingTeardown: Boolean(listeningTeardownRef.current),
    })

    turnRequestRef.current += 1
    sessionGenerationRef.current += 1
    sttRestartCountRef.current = 0
    sttRestartStartMsRef.current = 0
    sessionActiveRef.current = false
    setRoutePresence('outSession', 'session_end')
    playbackActiveRef.current = false
    audioPlayingRef.current = false
    playbackStartedRef.current = false
    playbackEndedAtMsRef.current = null
    clearResumeListeningTimer()
    endpointRequestRef.current += 1
    pendingNativeTranscriptRef.current = ''
    audioStopPlayback()
    setAudioUrl(null)
    setPlaybackQueue(createPlaybackQueueSnapshot())
    void cancelListeningForReason('session_end')
    const endedSnapshot = endActiveSession(snapshot).snapshot
    setSnapshot(endedSnapshot)
    setIsSessionActive(false)
    setStatus('session.ended')
    setBusy(false)

    const userTurns = messagesRef.current.filter(m => m.role === 'user').length
    try {
      const result = await api.generateSummary({
        sessionId: snapshot.sessionId, scenario: scenario.name,
        messages: messagesRef.current, turnNumber: userTurns,
      })
      setSummary(result.summary)
      await api.syncSession({
        session_id: snapshot.sessionId, scenario: scenario.name,
        accent: accent.name, turns: userTurns,
        messages: messagesRef.current, corrections: correctionHistory,
      }).catch(() => undefined)
    } catch {
      // Summary failure is non-fatal
    }
  }, [
    logUserAction, logVoiceMetric, isSessionActive, setSnapshot, setIsSessionActive, setStatus, setBusy,
    snapshotRef, messagesRef, sessionActiveRef, activeTabRef, listeningTeardownRef,
    turnRequestRef, sessionGenerationRef, sttRestartCountRef, sttRestartStartMsRef,
    setRoutePresence, playbackActiveRef, audioPlayingRef, playbackStartedRef, playbackEndedAtMsRef,
    clearResumeListeningTimer, endpointRequestRef, pendingNativeTranscriptRef,
    audioStopPlayback, setAudioUrl, setPlaybackQueue, cancelListeningForReason,
    api, scenario, accent, correctionHistory, setSummary,
  ])

  const selectScenario = useCallback(async (key: string) => {
    if (scenarioSwitching) {
      logUserAction('scenario_tap_ignored_switching', { to: key })
      return false
    }
    logUserAction('scenario_tap', { to: key, from: selectedScenarioKeyRef.current })
    if (key === selectedScenarioKeyRef.current) {
      logVoiceMetric('scenario_select_same', { key, sessionActive: sessionActiveRef.current })
      return true
    }
    // Always allow scenario switch without confirmation dialog for simplicity
    logVoiceMetric('scenario_select_requested', {
      from: selectedScenarioKeyRef.current, to: key,
      activeTab: activeTabRef.current, sessionActive: sessionActiveRef.current,
      canListenOnRoute: canListenOnRouteRef.current,
      pendingTeardown: Boolean(listeningTeardownRef.current),
    })
    setScenarioSwitching(true)
    setStatus('session.status.switching_session')
    try {
      turnRequestRef.current += 1
      endpointRequestRef.current += 1
      sessionGenerationRef.current += 1
      sttRestartCountRef.current = 0
      sttRestartStartMsRef.current = 0
      sessionActiveRef.current = false
      setRoutePresence('outSession', 'scenario_change')
      playbackActiveRef.current = false
      audioPlayingRef.current = false
      playbackStartedRef.current = false
      playbackEndedAtMsRef.current = null
      clearResumeListeningTimer()
      pendingNativeTranscriptRef.current = ''
      audioStopPlayback()
      setBusy(false)
      await cancelListeningForReason('scenario_change')
      setSelectedScenarioKey(key)
      setMessages([])
      setCorrectionHistory([])
      setAudioUrl(null)
      setPlaybackQueue(createPlaybackQueueSnapshot())
      setSummary(null)
      setSnapshot(createPlaybackQueueSnapshot() as unknown as WorkflowSnapshot)
      setIsSessionActive(false)
      setStatus('session.status.scenario_selected')
      logVoiceMetric('scenario_selected', { key })
      return true
    } finally {
      setScenarioSwitching(false)
    }
  }, [
    scenarioSwitching, logUserAction, logVoiceMetric, setScenarioSwitching, setStatus,
    selectedScenarioKeyRef, sessionActiveRef, activeTabRef, canListenOnRouteRef,
    listeningTeardownRef, turnRequestRef, endpointRequestRef, sessionGenerationRef,
    sttRestartCountRef, sttRestartStartMsRef, setRoutePresence,
    playbackActiveRef, audioPlayingRef, playbackStartedRef, clearResumeListeningTimer,
    pendingNativeTranscriptRef, audioStopPlayback, setBusy, cancelListeningForReason,
    setSelectedScenarioKey, setMessages, setCorrectionHistory, setAudioUrl,
    setPlaybackQueue, setSummary, setSnapshot, setIsSessionActive,
  ])

  const playCorrection = useCallback((text: string) => {
    logUserAction('play_correction_tap', { chars: text.length })
    clearResumeListeningTimer()
    void cancelListeningForReason('play_correction')
    void synthesizeCoachSpeech(text).then(voice => {
      if (voice.audioUrl) {
        playbackActiveRef.current = true
        playbackStartedRef.current = false
        playbackEndedAtMsRef.current = null
        setStatus('session.status.playing_reply')
        setAudioUrl(voice.audioUrl)
      }
    }).catch(() => {})
  }, [
    logUserAction, clearResumeListeningTimer, cancelListeningForReason,
    synthesizeCoachSpeech, playbackActiveRef, playbackStartedRef,
    playbackEndedAtMsRef, setStatus, setAudioUrl,
  ])

  return {
    startSession,
    synthesizeCoachSpeech,
    submitTurn,
    handleNativeFinalTranscript,
    handleListeningEndedWithoutTranscript,
    endSession,
    selectScenario,
    playCorrection,
  }
}
