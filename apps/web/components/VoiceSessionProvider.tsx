'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
  accentProfiles,
  pickRandomAccent,
  scenarios,
  type AccentProfile,
  type Scenario,
} from '@/lib/scenarios'
import { createInitialSnapshot, transition, type WorkflowSnapshot, type WorkflowState } from '@/lib/conversation-workflow'
import {
  acceptTranscriptTurn,
  canContinueListening as canContinueCurrentTurn,
  completeCoachPlayback,
  createVoiceActivitySnapshot,
  judgeEndpoint,
  pauseSessionForRoute,
  receiveCoachReply,
  recoverSessionError,
  requestCoachReply,
  shouldPauseForRouteExit,
  shouldResumeListeningOnRoute,
  type VoiceActivitySnapshot,
} from '@meteorvoice/session-core'
import { displayErrorFeedback } from '@meteorvoice/shared'
import type { ConversationMessage, ConversationResponse } from '@/lib/providers/types'
import { browserSTTSupported, createBrowserSTT } from '@/lib/providers/browser-stt'
import { normalizeTTSSpeed, readTTSSpeedPreference, ttsSpeedChangeEvent, flushPendingPreferences, type TTSSpeed } from '@/lib/tts-speed'
import { readTTSVoiceIdPreference, ttsVoiceIdChangeEvent, writeTTSVoiceIdPreference } from '@/lib/tts-voice'
import { useLocale, useT } from '@/components/LanguageProvider'
import { formatApiRequestError, readApiJsonResponse } from '@meteorvoice/api-client'
import {
  type PersistedVoiceSessionState,
  createClientSessionId,
  publishActiveSession,
  readPersistedSessionState,
  voiceSessionStateStorageKey,
} from '@/lib/session-persistence'
import { getSessionStatusKey, isKnownLocalizedSessionStatus } from '@/lib/session-status'
import { usePlaybackEngine } from '@/lib/hooks/use-playback-engine'
import { useListeningEngine } from '@/lib/hooks/use-listening-engine'
import { useTTSEngine } from '@/lib/hooks/use-tts-engine'

/** 教练语音播放完毕后、自动进入下一轮 listening 之前的静默间隔（毫秒） */
const postPlaybackListenDelayMs = 900

function wait(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

interface VoiceSessionContextValue {
  scenario: Scenario
  accent: AccentProfile
  snapshot: WorkflowSnapshot
  messages: ConversationMessage[]
  statusText: string
  isSessionActive: boolean
  isRoutePaused: boolean
  corrections: ConversationResponse['corrections']
  summary: string | null
  interrupted: boolean
  accentBanner: string | null
  ttsPreferenceLoaded: boolean
  voiceLevel: number | null
  playbackBlocked: boolean
  configureSession: (scenarioKey: string, accentKey: string) => void
  startSession: () => void
  endSession: () => Promise<void>
  continueSpeaking: () => void
  playBlockedReply: () => void
  playCorrection: (text: string) => void
}

const VoiceSessionContext = createContext<VoiceSessionContextValue | null>(null)

export function useVoiceSession() {
  const context = useContext(VoiceSessionContext)
  if (!context) throw new Error('useVoiceSession must be used within VoiceSessionProvider')
  return context
}

export default function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const tr = useT()
  const { locale } = useLocale()

  // ─── 会话状态 ───
  const [initialState] = useState(readPersistedSessionState)
  const [scenarioKey, setScenarioKey] = useState(initialState.scenarioKey)
  const [accent, setAccent] = useState<AccentProfile>(() =>
    accentProfiles.find(a => a.key === initialState.accentKey) ?? accentProfiles[0],
  )
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot>(initialState.snapshot)
  const [statusText, setStatusText] = useState(initialState.statusText || tr('session.ready'))
  const [isSessionActive, setIsSessionActive] = useState(initialState.isSessionActive)
  const [isRoutePaused, setIsRoutePaused] = useState(initialState.isRoutePaused)
  const [corrections, setCorrections] = useState<ConversationResponse['corrections']>(initialState.corrections)
  const [summary, setSummary] = useState<string | null>(initialState.summary)
  const [interrupted, setInterrupted] = useState(false)
  const [accentBanner, setAccentBanner] = useState<string | null>(null)
  const [ttsProvider, setTtsProvider] = useState('mock')
  const [ttsSpeed, setTtsSpeed] = useState<TTSSpeed>(readTTSSpeedPreference)
  const [ttsVoiceId, setTtsVoiceId] = useState<string | null>(readTTSVoiceIdPreference)
  const [ttsPreferenceLoaded, setTtsPreferenceLoaded] = useState(false)

  // ─── 派生值 ───
  const scenario = useMemo(
    () => scenarios.find(s => s.key === scenarioKey) ?? scenarios[0],
    [scenarioKey],
  )
  const messages = snapshot.messages
  const isSessionRoute = pathname.startsWith('/session')

  // ─── Refs：非响应式实时访问（不触发 re-render）───
  const snapshotRef = useRef(snapshot)
  const scenarioRef = useRef(scenario)
  const accentRef = useRef(accent)
  const ttsProviderRef = useRef(ttsProvider)
  const ttsSpeedRef = useRef(ttsSpeed)
  const ttsVoiceIdRef = useRef<string | null>(null)
  const activeSessionRef = useRef(initialState.isSessionActive)
  const activeTurnRef = useRef(0)
  const canListenOnRouteRef = useRef(isSessionRoute)
  const routePausedRef = useRef(initialState.isRoutePaused)
  const abortListeningRef = useRef<AbortController | null>(null)
  const simulateTurnRef = useRef<(turnId: number) => void>(() => {})
  const correctionHistoryRef = useRef<ConversationResponse['corrections']>(initialState.corrections)
  const voiceActivityRef = useRef<VoiceActivitySnapshot>(createVoiceActivitySnapshot())
  const listeningStartMsRef = useRef(0)
  const pendingEndpointTranscriptRef = useRef('')

  // ─── 引擎 Hooks ───
  // 播放引擎：audioRef、playbackNodesRef、unlock、blocked playback 等
  const playback = usePlaybackEngine()

  // 监听引擎：麦克风音量采样、VAD 快照、request 防竞态
  const listening = useListeningEngine({
    activeSessionRef,
    activeTurnRef,
    canListenOnRouteRef,
    snapshotRef,
    voiceActivityRef,
  })

  // TTS 引擎：文本合成、播放、错误恢复、mock 降级
  const tts = useTTSEngine({
    playback,
    setVoiceLevel: listening.setVoiceLevel,
    ttsProviderRef,
    ttsSpeedRef,
    ttsVoiceIdRef,
    activeSessionRef,
    activeTurnRef,
    canListenOnRouteRef,
    snapshotRef,
    setStatusText,
    tr,
  })

  // ─── Ref 同步：state → ref，供 callback 读取最新值 ───
  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  useEffect(() => {
    scenarioRef.current = scenario
  }, [scenario])

  useEffect(() => {
    accentRef.current = accent
  }, [accent])

  useEffect(() => {
    ttsProviderRef.current = ttsProvider
  }, [ttsProvider])

  useEffect(() => {
    ttsSpeedRef.current = ttsSpeed
  }, [ttsSpeed])

  useEffect(() => {
    ttsVoiceIdRef.current = ttsVoiceId
  }, [ttsVoiceId])

  // ─── TTS 偏好同步 ───
  useEffect(() => {
    const syncSpeedPreference = () => setTtsSpeed(readTTSSpeedPreference())

    function handleSpeedChange(event: Event) {
      const customEvent = event as CustomEvent<{ speed?: TTSSpeed }>
      setTtsSpeed(customEvent.detail?.speed ?? readTTSSpeedPreference())
    }

    function handleVoiceIdChange(event: Event) {
      const customEvent = event as CustomEvent<{ voiceId?: string | null }>
      setTtsVoiceId(customEvent.detail?.voiceId ?? null)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') syncSpeedPreference()
    }

    window.addEventListener(ttsSpeedChangeEvent, handleSpeedChange)
    window.addEventListener(ttsVoiceIdChangeEvent, handleVoiceIdChange)
    window.addEventListener('focus', syncSpeedPreference)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener(ttsSpeedChangeEvent, handleSpeedChange)
      window.removeEventListener(ttsVoiceIdChangeEvent, handleVoiceIdChange)
      window.removeEventListener('focus', syncSpeedPreference)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (accentBanner) {
      const timer = setTimeout(() => setAccentBanner(null), 2500)
      return () => clearTimeout(timer)
    }
  }, [accentBanner])

  useEffect(() => {
    void flushPendingPreferences()
    fetch('/api/preferences', {
      headers: { 'X-MeteorVoice-Client': 'meteorvoice-web' },
    })
      .then(res => res.json())
      .then((data: { tts_provider?: string; tts_speed?: number; tts_voice_id?: string | null }) => {
        if (data.tts_provider) setTtsProvider(data.tts_provider)
        if ('tts_voice_id' in data) {
          const serverVoiceId = data.tts_voice_id ?? readTTSVoiceIdPreference()
          setTtsVoiceId(serverVoiceId)
          writeTTSVoiceIdPreference(serverVoiceId)
        }
        if (typeof data.tts_speed === 'number') {
          const serverSpeed = normalizeTTSSpeed(data.tts_speed)
          setTtsSpeed(serverSpeed)
          // 覆盖 localStorage 为 API 权威值
          if (typeof window !== 'undefined') {
            localStorage.setItem('meteorvoice-tts-speed', String(serverSpeed))
          }
        }
      })
      .catch(() => {})
      .finally(() => setTtsPreferenceLoaded(true))
  }, [])

  // ─── 会话生命周期副作用 ───
  useEffect(() => {
    publishActiveSession(isSessionActive)
    return () => publishActiveSession(false)
  }, [isSessionActive])

  useEffect(() => {
    activeSessionRef.current = isSessionActive
  }, [isSessionActive])

  useEffect(() => {
    routePausedRef.current = isRoutePaused
  }, [isRoutePaused])

  useEffect(() => {
    setStatusText(current => {
      if (!isKnownLocalizedSessionStatus(current)) return current
      return tr(getSessionStatusKey({
        activeSession: activeSessionRef.current,
        routePaused: routePausedRef.current,
        workflowState: snapshotRef.current.state,
      }))
    })
  }, [tr])

  // ─── 会话状态持久化到 sessionStorage ───
  useEffect(() => {
    correctionHistoryRef.current = corrections
  }, [corrections])

  useEffect(() => {
    if (!isSessionActive) {
      sessionStorage.removeItem(voiceSessionStateStorageKey)
      return
    }

    const state: PersistedVoiceSessionState = {
      scenarioKey: scenarioRef.current.key,
      accentKey: accentRef.current.key,
      snapshot,
      statusText,
      isSessionActive,
      isRoutePaused,
      corrections,
      summary,
    }
    sessionStorage.setItem(voiceSessionStateStorageKey, JSON.stringify(state))
  }, [accent.key, corrections, isRoutePaused, isSessionActive, scenario.key, snapshot, statusText, summary])

  // ─── 工作流辅助：状态转换 ───
  const updateSnapshot = useCallback((updater: (current: WorkflowSnapshot) => WorkflowSnapshot) => {
    const next = updater(snapshotRef.current)
    snapshotRef.current = next
    setSnapshot(next)
  }, [])

  const applyTransition = useCallback((to: WorkflowState, patch: Partial<WorkflowSnapshot> = {}) => {
    updateSnapshot(prev => transition(prev, to, { ...patch }))
  }, [updateSnapshot])

  // ─── Turn 控制：中止、暂停、恢复 ───
  /** 中止当前 turn：abort STT、递增 turnId、停止音量采样、释放播放锁 */
  const cancelCurrentTurn = useCallback(() => {
    abortListeningRef.current?.abort()
    abortListeningRef.current = null
    activeTurnRef.current += 1
    listening.stopVoiceLevelSampling()
    playback.resolvePendingPlayback()
  }, [listening.stopVoiceLevelSampling, playback.resolvePendingPlayback])

  const pauseListeningForNavigation = useCallback(() => {
    if (!activeSessionRef.current) return
    canListenOnRouteRef.current = false
    routePausedRef.current = true
    setIsRoutePaused(true)
    if (shouldPauseForRouteExit({ activeSession: activeSessionRef.current, workflowState: snapshotRef.current.state })) {
      cancelCurrentTurn()
      updateSnapshot(current => pauseSessionForRoute(current).snapshot)
    }
    setStatusText(tr('session.paused'))
    listening.stopVoiceLevelSampling()
  }, [cancelCurrentTurn, listening.stopVoiceLevelSampling, tr, updateSnapshot])

  const rotateAccent = useCallback((): AccentProfile => {
    const next = pickRandomAccent()
    accentRef.current = next
    setAccent(next)
    return next
  }, [])

  // ─── 会话管理：开始、结束、配置、继续 ───
  const startNextTurn = useCallback(() => {
    if (!activeSessionRef.current || !canListenOnRouteRef.current) return
    const nextTurnId = activeTurnRef.current + 1
    activeTurnRef.current = nextTurnId
    simulateTurnRef.current(nextTurnId)
  }, [])

  const resumeListeningOnSessionRoute = useCallback(() => {
    if (!activeSessionRef.current) return
    canListenOnRouteRef.current = true
    routePausedRef.current = false
    setIsRoutePaused(false)
    if (shouldResumeListeningOnRoute({ activeSession: activeSessionRef.current, workflowState: snapshotRef.current.state })) {
      startNextTurn()
    }
  }, [startNextTurn])

  useEffect(() => {
    canListenOnRouteRef.current = isSessionRoute
    if (!activeSessionRef.current) return

    if (!isSessionRoute) {
      pauseListeningForNavigation()
      return
    }

    if (routePausedRef.current) resumeListeningOnSessionRoute()
  }, [isSessionRoute, pauseListeningForNavigation, resumeListeningOnSessionRoute])

  const configureSession = useCallback((nextScenarioKey: string, nextAccentKey: string) => {
    if (activeSessionRef.current) return
    setScenarioKey(nextScenarioKey)
    const nextAccent = accentProfiles.find(a => a.key === nextAccentKey) ?? accentProfiles[0]
    accentRef.current = nextAccent
    setAccent(nextAccent)
  }, [])

  const startSession = useCallback(() => {
    playback.unlockSessionAudio()
    if (!ttsPreferenceLoaded) {
      setStatusText(tr('session.loading_voice'))
      return
    }
    if (!canListenOnRouteRef.current) {
      setStatusText(tr('session.paused'))
      return
    }

    const nextSnapshot = createInitialSnapshot(createClientSessionId())
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    activeSessionRef.current = true
    routePausedRef.current = false
    correctionHistoryRef.current = []
    setIsSessionActive(true)
    setIsRoutePaused(false)
    setCorrections([])
    setSummary(null)
    setInterrupted(false)
    listeningStartMsRef.current = 0
    pendingEndpointTranscriptRef.current = ''
    startNextTurn()
  }, [playback.unlockSessionAudio, startNextTurn, tr, ttsPreferenceLoaded])

  const endSession = useCallback(async () => {
    activeSessionRef.current = false
    routePausedRef.current = false
    setIsRoutePaused(false)
    cancelCurrentTurn()
    setIsSessionActive(false)
    applyTransition('session_ended')
    setStatusText(tr('session.ended'))
    listening.stopVoiceLevelSampling()
    sessionStorage.removeItem(voiceSessionStateStorageKey)

    const currentSnapshot = snapshotRef.current
    const currentScenario = scenarioRef.current
    const currentAccent = accentRef.current
    const sessionCorrections = correctionHistoryRef.current

    try {
      const raw = localStorage.getItem('meteorvoice-history')
      const history = raw ? JSON.parse(raw) : []
      history.unshift({
        id: currentSnapshot.sessionId,
        scenario: currentScenario.name,
        scenarioKey: currentScenario.key,
        accent: currentAccent.name,
        accentKey: currentAccent.key,
        date: new Date().toISOString().split('T')[0],
        turns: currentSnapshot.turnNumber,
        corrections: sessionCorrections.length,
        correctionItems: sessionCorrections,
        status: 'completed',
        summary: '',
      })
      localStorage.setItem('meteorvoice-history', JSON.stringify(history.slice(0, 50)))
    } catch {}

    try {
      await fetch('/api/session/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSnapshot.sessionId,
          scenario: currentScenario.name,
          accent: currentAccent.name,
          turns: currentSnapshot.turnNumber,
          messages: currentSnapshot.messages.slice(-10),
          turnNumber: currentSnapshot.turnNumber,
          corrections: sessionCorrections,
        }),
      })
    } catch {}

    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSnapshot.sessionId,
          scenario: currentScenario.name,
          messages: currentSnapshot.messages.slice(-10),
          turnNumber: currentSnapshot.turnNumber,
        }),
      })
      const data = await res.json()
      if (data.summary) setSummary(data.summary)
    } catch {}
  }, [applyTransition, cancelCurrentTurn, listening.stopVoiceLevelSampling, tr])

  const continueSpeaking = useCallback(() => {
    playback.unlockSessionAudio()
    activeSessionRef.current = true
    if (!canListenOnRouteRef.current) {
      setStatusText(tr('session.paused'))
      return
    }
    listeningStartMsRef.current = 0
    pendingEndpointTranscriptRef.current = ''
    startNextTurn()
  }, [playback.unlockSessionAudio, startNextTurn, tr])

  /** 用 TTS 引擎朗读纠错文本 */
  const playCorrection = useCallback((text: string) => {
    void tts.speakText(text, accentRef.current.name)
  }, [tts])

  // ─── Turn 编排：一个完整的对话周期 listening → endpoint → thinking → speaking → correcting ───
  async function simulateTurn(turnId: number) {
    const isCurrentTurn = () => activeSessionRef.current && activeTurnRef.current === turnId
    const canContinueListening = () => canContinueCurrentTurn({
      activeSession: activeSessionRef.current,
      activeTurnId: activeTurnRef.current,
      currentTurnId: turnId,
      canListenOnRoute: canListenOnRouteRef.current,
      workflowState: snapshotRef.current.state,
    })

    setInterrupted(false)
    setStatusText(tr('session.listening'))
    if (snapshotRef.current.state !== 'listening') {
      applyTransition('listening')
    }
    if (listeningStartMsRef.current === 0) {
      listeningStartMsRef.current = Date.now()
      pendingEndpointTranscriptRef.current = ''
    }

    const abortController = new AbortController()
    abortListeningRef.current = abortController

    let transcript: string
    if (browserSTTSupported()) {
      try {
        listening.startListeningLevelSampling(turnId)
        const browserSTT = createBrowserSTT()
        const result = await browserSTT.transcribe(new Blob(), {
          signal: abortController.signal,
          language: 'en-US',
          getVoiceActivity: () => voiceActivityRef.current,
        })
        if (!canContinueListening()) return
        transcript = result.transcript
      } catch {
        listening.stopVoiceLevelSampling()
        if (!canContinueListening()) return
        setStatusText(tr('session.waiting_for_speech'))
        updateSnapshot(current => recoverSessionError({
          snapshot: current,
          reason: 'no_speech',
          activeSession: activeSessionRef.current,
          canListenOnRoute: canListenOnRouteRef.current,
        }).snapshot)
        window.setTimeout(() => {
          if (activeSessionRef.current && canListenOnRouteRef.current && snapshotRef.current.state === 'idle') {
            startNextTurn()
          }
        }, 500)
        return
      }
    } else {
      abortListeningRef.current = null
      listening.stopVoiceLevelSampling()
      if (!canContinueListening()) return
      setStatusText(tr('session.stt_unavailable'))
      updateSnapshot(current => recoverSessionError({
        snapshot: current,
        reason: 'stt_unavailable',
        activeSession: activeSessionRef.current,
        canListenOnRoute: canListenOnRouteRef.current,
      }).snapshot)
      return
    }
    abortListeningRef.current = null
    const endpointVoiceActivity = voiceActivityRef.current
    listening.stopVoiceLevelSampling()
    const endpointTranscript = [pendingEndpointTranscriptRef.current, transcript]
      .map(part => part.trim())
      .filter(Boolean)
      .join(' ')

    // 三层判停：本地判断 + LLM 语义确认 + 安全网超时
    const endpointResult = await judgeEndpoint({
      transcript: endpointTranscript,
      voiceActivity: endpointVoiceActivity,
      listeningDurationMs: Date.now() - listeningStartMsRef.current,
      lastVoiceAtMs: endpointVoiceActivity.lastVoiceAt ?? null,
      messages: snapshotRef.current.messages,
      scenario: scenarioRef.current.key,
      semanticCheck: async (t, ctx) => {
        const res = await fetch('/api/semantic-endpoint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-MeteorVoice-Client': 'meteorvoice-web' },
          body: JSON.stringify({ transcript: t, messages: ctx.messages, scenario: ctx.scenario }),
        })
        const data = await readApiJsonResponse<{ judgment: 'done' | 'thinking' }>(res, 'Semantic check failed')
        return data.judgment
      },
    })
    if (!isCurrentTurn()) return

    if (endpointResult.judgment === 'continue') {
      pendingEndpointTranscriptRef.current = endpointTranscript
      setStatusText(tr(endpointResult.reason === 'llm_thinking' ? 'session.waiting_for_speech' : 'session.listening'))
      window.setTimeout(() => {
        if (isCurrentTurn() && activeSessionRef.current && canListenOnRouteRef.current) {
          simulateTurnRef.current(turnId)
        }
      }, 500)
      return
    }

    listeningStartMsRef.current = 0 // turn 已提交，下一轮重新计时
    pendingEndpointTranscriptRef.current = ''
    setStatusText(tr('session.transcribing'))
    const acceptedTurn = acceptTranscriptTurn({
      snapshot: snapshotRef.current,
      transcript: endpointTranscript,
      messages: snapshotRef.current.messages,
    })
    snapshotRef.current = acceptedTurn.snapshot
    setSnapshot(acceptedTurn.snapshot)

    const currentSnapshot = snapshotRef.current
    const currentAccent = accentRef.current
    const newAccent = currentSnapshot.turnNumber > 0 && currentSnapshot.turnNumber % 10 === 0 ? rotateAccent() : currentAccent
    const currentScenario = scenarioRef.current

    setStatusText(tr('session.preparing_reply'))
    updateSnapshot(current => requestCoachReply(current))
    let response: ConversationResponse
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-MeteorVoice-Client': 'meteorvoice-web' },
        body: JSON.stringify({
          messages: acceptedTurn.messages,
          context: {
            scenario: { name: currentScenario.name, description: currentScenario.description },
            accentProfile: { name: newAccent.name, region: newAccent.region },
            sessionId: currentSnapshot.sessionId,
            turnNumber: currentSnapshot.turnNumber + 1,
            responseLocale: locale,
          },
        }),
      })
      response = await readApiJsonResponse<ConversationResponse>(res, 'Chat request failed')
    } catch (error) {
      if (!isCurrentTurn()) return
      const requestError = formatApiRequestError(error, {
        context: 'web_session_chat',
        presentation: 'banner',
      })
      displayErrorFeedback(requestError, 'web_session_chat')
      setStatusText(canListenOnRouteRef.current ? requestError.displayMessage : tr('session.paused'))
      updateSnapshot(current => recoverSessionError({
        snapshot: current,
        reason: 'coach_reply_failed',
        activeSession: activeSessionRef.current,
        canListenOnRoute: canListenOnRouteRef.current,
      }).snapshot)
      return
    }

    if (!isCurrentTurn()) return

    setStatusText(tr('session.speaking'))
    const coachTurn = receiveCoachReply({
      snapshot: snapshotRef.current,
      messages: acceptedTurn.messages,
      responseText: response.text,
      corrections: response.corrections,
    })
    snapshotRef.current = coachTurn.snapshot
    setSnapshot(coachTurn.snapshot)
    listening.setVoiceLevel(null)
    await tts.speakText(response.text, newAccent.name)
    await wait(postPlaybackListenDelayMs)
    if (!isCurrentTurn()) return

    if (response.corrections.length > 0) {
      correctionHistoryRef.current = [...correctionHistoryRef.current, ...response.corrections]
      setCorrections(correctionHistoryRef.current)
    }
    updateSnapshot(current => completeCoachPlayback({
      snapshot: current,
      corrections: response.corrections,
    }).snapshot)

    window.setTimeout(() => {
      if (canContinueListening()) {
        startNextTurn()
      } else if (isCurrentTurn() && activeSessionRef.current) {
        routePausedRef.current = true
        setIsRoutePaused(true)
        if (snapshotRef.current.state === 'speaking') applyTransition('idle')
        setStatusText(tr('session.paused'))
      }
    }, 250)
  }

  useEffect(() => {
    simulateTurnRef.current = turnId => {
      void simulateTurn(turnId)
    }
  })

  const value = useMemo<VoiceSessionContextValue>(() => ({
    scenario,
    accent,
    snapshot,
    messages,
    statusText,
    isSessionActive,
    isRoutePaused,
    corrections,
    summary,
    interrupted,
    accentBanner,
    ttsPreferenceLoaded,
    voiceLevel: listening.voiceLevel,
    playbackBlocked: playback.playbackBlocked,
    configureSession,
    startSession,
    endSession,
    continueSpeaking,
    playBlockedReply: playback.playBlockedReply,
    playCorrection,
  }), [
    accent,
    accentBanner,
    configureSession,
    continueSpeaking,
    corrections,
    endSession,
    interrupted,
    isRoutePaused,
    isSessionActive,
    messages,
    playback.playbackBlocked,
    playback.playBlockedReply,
    playCorrection,
    scenario,
    snapshot,
    startSession,
    statusText,
    summary,
    ttsPreferenceLoaded,
    listening.voiceLevel,
  ])

  return (
    <VoiceSessionContext.Provider value={value}>
      {children}
    </VoiceSessionContext.Provider>
  )
}
