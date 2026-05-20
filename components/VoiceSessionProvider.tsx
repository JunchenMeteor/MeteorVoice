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
import type { ConversationMessage, ConversationResponse } from '@/lib/providers/types'
import { createMockSTT } from '@/lib/providers/mock-stt'
import { createMockTTS } from '@/lib/providers/mock-tts'
import { browserSTTSupported, createBrowserSTT } from '@/lib/providers/browser-stt'
import { useT } from '@/components/LanguageProvider'

const mockSTT = createMockSTT()
const mockTTS = createMockTTS()
const activeSessionStorageKey = 'meteorvoice-active-session'

function publishActiveSession(active: boolean) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(activeSessionStorageKey, active ? 'true' : 'false')
  window.dispatchEvent(new CustomEvent('meteorvoice-active-session-change', { detail: { active } }))
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
  configureSession: (scenarioKey: string, accentKey: string) => void
  startSession: () => void
  endSession: () => Promise<void>
  continueSpeaking: () => void
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
  const [scenarioKey, setScenarioKey] = useState('small-talk')
  const [accent, setAccent] = useState<AccentProfile>(accentProfiles[0])
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot>(() => createInitialSnapshot(crypto.randomUUID()))
  const [statusText, setStatusText] = useState(tr('session.ready'))
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [isRoutePaused, setIsRoutePaused] = useState(false)
  const [corrections, setCorrections] = useState<ConversationResponse['corrections']>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [interrupted, setInterrupted] = useState(false)
  const [accentBanner, setAccentBanner] = useState<string | null>(null)
  const [ttsProvider, setTtsProvider] = useState('mock')
  const [ttsPreferenceLoaded, setTtsPreferenceLoaded] = useState(false)

  const scenario = useMemo(
    () => scenarios.find(s => s.key === scenarioKey) ?? scenarios[0],
    [scenarioKey],
  )
  const messages = snapshot.messages
  const isSessionRoute = pathname.startsWith('/session')

  const snapshotRef = useRef(snapshot)
  const scenarioRef = useRef(scenario)
  const accentRef = useRef(accent)
  const ttsProviderRef = useRef(ttsProvider)
  const activeSessionRef = useRef(false)
  const activeTurnRef = useRef(0)
  const canListenOnRouteRef = useRef(isSessionRoute)
  const routePausedRef = useRef(false)
  const abortListeningRef = useRef<AbortController | null>(null)
  const simulateTurnRef = useRef<(turnId: number) => void>(() => {})
  const correctionHistoryRef = useRef<ConversationResponse['corrections']>([])

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
    if (accentBanner) {
      const timer = setTimeout(() => setAccentBanner(null), 2500)
      return () => clearTimeout(timer)
    }
  }, [accentBanner])

  useEffect(() => {
    fetch('/api/preferences')
      .then(res => res.json())
      .then((data: { tts_provider?: string }) => {
        if (data.tts_provider) setTtsProvider(data.tts_provider)
      })
      .catch(() => {})
      .finally(() => setTtsPreferenceLoaded(true))
  }, [])

  useEffect(() => {
    publishActiveSession(isSessionActive)
    return () => publishActiveSession(false)
  }, [isSessionActive])

  const updateSnapshot = useCallback((updater: (current: WorkflowSnapshot) => WorkflowSnapshot) => {
    const next = updater(snapshotRef.current)
    snapshotRef.current = next
    setSnapshot(next)
  }, [])

  const applyTransition = useCallback((to: WorkflowState, patch: Partial<WorkflowSnapshot> = {}) => {
    updateSnapshot(prev => transition(prev, to, { ...patch }))
  }, [updateSnapshot])

  const cancelCurrentTurn = useCallback(() => {
    abortListeningRef.current?.abort()
    abortListeningRef.current = null
    activeTurnRef.current += 1
  }, [])

  const pauseListeningForNavigation = useCallback(() => {
    if (!activeSessionRef.current) return
    canListenOnRouteRef.current = false
    routePausedRef.current = true
    setIsRoutePaused(true)
    if (snapshotRef.current.state === 'listening') {
      cancelCurrentTurn()
      applyTransition('idle')
    }
    setStatusText(tr('session.paused'))
  }, [applyTransition, cancelCurrentTurn, tr])

  const rotateAccent = useCallback((): AccentProfile => {
    const next = pickRandomAccent()
    accentRef.current = next
    setAccent(next)
    setAccentBanner(`${tr('session.accent_changed')} ${next.name}`)
    return next
  }, [tr])

  const speakText = useCallback(async (text: string, accentName: string) => {
    try {
      const provider = ttsProviderRef.current
      if (provider === 'mock') {
        await mockTTS.synthesize(text, { accent: accentName })
        return
      }
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, accent: accentName, provider }),
      })
      const result = await res.json() as { audioUrl?: string }
      if (result.audioUrl) {
        const audio = new Audio(result.audioUrl)
        await audio.play()
      }
    } catch {
      await mockTTS.synthesize(text, { accent: accentName })
    }
  }, [])

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
    if (snapshotRef.current.state === 'idle' || snapshotRef.current.state === 'correcting') {
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
    if (!ttsPreferenceLoaded) {
      setStatusText(tr('session.loading_voice'))
      return
    }
    if (!canListenOnRouteRef.current) {
      setStatusText(tr('session.paused'))
      return
    }

    const nextSnapshot = createInitialSnapshot(crypto.randomUUID())
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
    startNextTurn()
  }, [startNextTurn, tr, ttsPreferenceLoaded])

  const endSession = useCallback(async () => {
    activeSessionRef.current = false
    routePausedRef.current = false
    setIsRoutePaused(false)
    cancelCurrentTurn()
    setIsSessionActive(false)
    applyTransition('session_ended')
    setStatusText(tr('session.ended'))

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
  }, [applyTransition, cancelCurrentTurn, tr])

  const continueSpeaking = useCallback(() => {
    activeSessionRef.current = true
    if (!canListenOnRouteRef.current) {
      setStatusText(tr('session.paused'))
      return
    }
    startNextTurn()
  }, [startNextTurn, tr])

  const playCorrection = useCallback((text: string) => {
    void speakText(text, accentRef.current.name)
  }, [speakText])

  async function simulateTurn(turnId: number) {
    const isCurrentTurn = () => activeSessionRef.current && activeTurnRef.current === turnId
    const canContinueListening = () => isCurrentTurn() && canListenOnRouteRef.current

    setInterrupted(false)
    setStatusText(tr('session.listening'))
    applyTransition('listening')

    const abortController = new AbortController()
    abortListeningRef.current = abortController

    let transcript: string
    if (browserSTTSupported()) {
      try {
        const browserSTT = createBrowserSTT()
        const result = await browserSTT.transcribe(new Blob(), { signal: abortController.signal })
        if (!canContinueListening()) return
        transcript = result.transcript
      } catch {
        if (!canContinueListening()) return
        setStatusText(tr('session.no_speech'))
        applyTransition('idle')
        return
      }
    } else {
      try {
        const result = await mockSTT.transcribe(new Blob(), { signal: abortController.signal })
        if (!canContinueListening()) return
        transcript = result.transcript
      } catch {
        if (!canContinueListening()) return
        return
      }
    }
    abortListeningRef.current = null

    setStatusText(tr('session.transcribing'))
    applyTransition('transcribing', { lastTranscript: transcript })

    const userMsg: ConversationMessage = { role: 'user', content: transcript }
    const snapshotBeforeUserMessage = snapshotRef.current
    const messagesWithUser = [...snapshotBeforeUserMessage.messages, userMsg]
    updateSnapshot(prev => ({ ...prev, messages: messagesWithUser }))

    const currentSnapshot = snapshotRef.current
    const currentAccent = accentRef.current
    const newAccent = currentSnapshot.turnNumber > 0 && currentSnapshot.turnNumber % 3 === 0 ? rotateAccent() : currentAccent
    const currentScenario = scenarioRef.current

    setStatusText(tr('session.thinking'))
    applyTransition('thinking')
    let response: ConversationResponse
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesWithUser,
          context: {
            scenario: { name: currentScenario.name, description: currentScenario.description },
            accentProfile: { name: newAccent.name, region: newAccent.region },
            sessionId: currentSnapshot.sessionId,
            turnNumber: currentSnapshot.turnNumber + 1,
          },
        }),
      })
      if (!res.ok) throw new Error(`Chat request failed: ${res.status}`)
      response = await res.json() as ConversationResponse
    } catch {
      if (!isCurrentTurn()) return
      setStatusText(canListenOnRouteRef.current ? tr('session.tap_mic') : tr('session.paused'))
      applyTransition('idle')
      return
    }

    if (!isCurrentTurn()) return

    setStatusText(tr('session.speaking'))
    applyTransition('speaking', { lastResponse: response.text })
    await speakText(response.text, newAccent.name)
    if (!isCurrentTurn()) return

    const assistantMsg: ConversationMessage = { role: 'assistant', content: response.text }
    updateSnapshot(prev => ({ ...prev, messages: [...prev.messages, assistantMsg] }))

    if (response.corrections.length > 0) {
      correctionHistoryRef.current = [...correctionHistoryRef.current, ...response.corrections]
      setCorrections(correctionHistoryRef.current)
      applyTransition('correcting', { lastCorrections: response.corrections })
    }

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
    configureSession,
    startSession,
    endSession,
    continueSpeaking,
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
    playCorrection,
    scenario,
    snapshot,
    startSession,
    statusText,
    summary,
    ttsPreferenceLoaded,
  ])

  return (
    <VoiceSessionContext.Provider value={value}>
      {children}
    </VoiceSessionContext.Provider>
  )
}
