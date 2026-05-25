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
  canSampleListeningLevel,
  canSamplePlaybackLevel,
  completeCoachPlayback,
  createVoiceActivitySnapshot,
  judgeEndpoint,
  pauseSessionForRoute,
  receiveCoachReply,
  recoverSessionError,
  requestCoachReply,
  shouldPauseForRouteExit,
  shouldResumeListeningOnRoute,
  updateVoiceActivitySnapshot,
  type VoiceActivitySnapshot,
} from '@meteorvoice/session-core'
import { getTTSSpeedRouting, t as translations } from '@meteorvoice/shared'
import type { ConversationMessage, ConversationResponse } from '@/lib/providers/types'
import { createMockTTS } from '@/lib/providers/mock-tts'
import { browserSTTSupported, createBrowserSTT } from '@/lib/providers/browser-stt'
import { normalizeTTSSpeed, readTTSSpeedPreference, ttsSpeedChangeEvent, flushPendingPreferences, type TTSSpeed } from '@/lib/tts-speed'
import { ttsVoiceIdChangeEvent } from '@/lib/tts-voice'
import { useT } from '@/components/LanguageProvider'

const mockTTS = createMockTTS()
const activeSessionStorageKey = 'meteorvoice-active-session'
const voiceSessionStateStorageKey = 'meteorvoice-session-state'
const postPlaybackListenDelayMs = 900
const silentAudioUrl = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAAAA=='
const sessionStatusKeys = [
  'session.ready',
  'session.loading_voice',
  'session.paused',
  'session.listening',
  'session.transcribing',
  'session.thinking',
  'session.preparing_reply',
  'session.speaking',
  'session.playback_blocked',
  'session.correcting',
  'session.ended',
  'session.tap_mic',
  'session.no_speech',
  'session.waiting_for_speech',
  'session.stt_unavailable',
] as const

type AudioLevelStop = () => void

type AudioLevelSource = {
  analyser: AnalyserNode
  audioContext: AudioContext
  stopSource?: () => void
  closeOnStop?: boolean
}

type PlaybackAudioNodes = {
  audioContext: AudioContext
  analyser: AnalyserNode
  source: MediaElementAudioSourceNode
}

type PendingPlayback = {
  audioUrl: string
  onLevel?: (level: number | null) => void
  speed?: number
  resolve: () => void
}

class PlaybackBlockedError extends Error {
  constructor(readonly audioUrl: string) {
    super('Audio playback requires a user gesture')
    this.name = 'PlaybackBlockedError'
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

interface PersistedVoiceSessionState {
  scenarioKey: string
  accentKey: string
  snapshot: WorkflowSnapshot
  statusText: string
  isSessionActive: boolean
  isRoutePaused: boolean
  corrections: ConversationResponse['corrections']
  summary: string | null
}

function createDefaultPersistedState(): PersistedVoiceSessionState {
  return {
    scenarioKey: 'small-talk',
    accentKey: 'american',
    snapshot: createInitialSnapshot(crypto.randomUUID()),
    statusText: '',
    isSessionActive: false,
    isRoutePaused: false,
    corrections: [],
    summary: null,
  }
}

function readPersistedSessionState(): PersistedVoiceSessionState {
  if (typeof window === 'undefined') return createDefaultPersistedState()

  try {
    const raw = sessionStorage.getItem(voiceSessionStateStorageKey)
    if (!raw) return createDefaultPersistedState()
    const parsed = JSON.parse(raw) as Partial<PersistedVoiceSessionState>
    if (!parsed.snapshot?.sessionId) return createDefaultPersistedState()

    return {
      scenarioKey: parsed.scenarioKey ?? 'small-talk',
      accentKey: parsed.accentKey ?? 'american',
      snapshot: parsed.snapshot,
      statusText: parsed.statusText ?? '',
      isSessionActive: parsed.isSessionActive === true,
      isRoutePaused: parsed.isRoutePaused === true,
      corrections: parsed.corrections ?? [],
      summary: parsed.summary ?? null,
    }
  } catch {
    return createDefaultPersistedState()
  }
}

function publishActiveSession(active: boolean) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(activeSessionStorageKey, active ? 'true' : 'false')
  window.dispatchEvent(new CustomEvent('meteorvoice-active-session-change', { detail: { active } }))
}

function wait(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function isKnownLocalizedSessionStatus(statusText: string) {
  return Object.values(translations).some(localeTable =>
    sessionStatusKeys.some(key => localeTable[key] === statusText),
  )
}

function getSessionStatusKey(input: {
  activeSession: boolean
  routePaused: boolean
  workflowState: WorkflowState
}) {
  if (input.routePaused) return 'session.paused'
  if (input.workflowState === 'session_ended') return 'session.ended'
  if (!input.activeSession) return 'session.ready'

  switch (input.workflowState) {
    case 'listening':
      return 'session.listening'
    case 'transcribing':
      return 'session.transcribing'
    case 'thinking':
      return 'session.preparing_reply'
    case 'speaking':
      return 'session.speaking'
    case 'correcting':
      return 'session.correcting'
    case 'idle':
      return 'session.tap_mic'
    default:
      return 'session.ready'
  }
}

function sampleAudioLevel(source: AudioLevelSource, onLevel: (level: number | null) => void): AudioLevelStop {
  const data = new Uint8Array(source.analyser.fftSize)
  let frame = 0
  let stopped = false

  function tick() {
    if (stopped) return
    source.analyser.getByteTimeDomainData(data)
    let sum = 0
    for (const value of data) {
      const centered = (value - 128) / 128
      sum += centered * centered
    }
    const rms = Math.sqrt(sum / data.length)
    onLevel(Math.min(1, rms * 4.2))
    frame = window.requestAnimationFrame(tick)
  }

  frame = window.requestAnimationFrame(tick)

  return () => {
    if (stopped) return
    stopped = true
    window.cancelAnimationFrame(frame)
    source.stopSource?.()
    onLevel(null)
    if (source.closeOnStop !== false) {
      void source.audioContext.close().catch(() => {})
    }
  }
}

async function createMicLevelSampler(onLevel: (level: number | null) => void): Promise<AudioLevelStop | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null

  try {
    const permissions = navigator.permissions
    if (!permissions?.query) return null
    const status = await permissions.query({ name: 'microphone' as PermissionName })
    if (status.state !== 'granted') return null
  } catch {
    return null
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext
    if (!AudioContextCtor) {
      stream.getTracks().forEach(track => track.stop())
      return null
    }

    const audioContext = new AudioContextCtor()
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.72
    const source = audioContext.createMediaStreamSource(stream)
    source.connect(analyser)

    return sampleAudioLevel({
      analyser,
      audioContext,
      stopSource: () => stream.getTracks().forEach(track => track.stop()),
    }, onLevel)
  } catch {
    onLevel(null)
    return null
  }
}

function getPlaybackLevelSource(
  audio: HTMLAudioElement,
  nodesRef: { current: PlaybackAudioNodes | null },
  onLevel: (level: number | null) => void,
): AudioLevelSource | null {
  try {
    if (!nodesRef.current) {
      const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext
      if (!AudioContextCtor) return null
      const audioContext = new AudioContextCtor()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.7
      const source = audioContext.createMediaElementSource(audio)
      source.connect(analyser)
      analyser.connect(audioContext.destination)
      nodesRef.current = { audioContext, analyser, source }
    }
    void nodesRef.current.audioContext.resume().catch(() => {})
    return {
      analyser: nodesRef.current.analyser,
      audioContext: nodesRef.current.audioContext,
      closeOnStop: false,
    }
  } catch {
    onLevel(null)
    return null
  }
}

function normalizePlaybackRate(speed?: number) {
  if (typeof speed !== 'number' || !Number.isFinite(speed)) return 1
  return Math.min(1.6, Math.max(0.5, speed))
}

function isCoarsePointerDevice() {
  if (typeof window === 'undefined') return false
  return Boolean(window.matchMedia?.('(pointer: coarse)').matches)
}

function getPlaybackStartDelayMs() {
  return isCoarsePointerDevice() ? 120 : 0
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

function encodeWavWithSilence(audioBuffer: AudioBuffer, silenceSeconds: number) {
  const channels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const silenceFrames = Math.ceil(sampleRate * silenceSeconds)
  const totalFrames = silenceFrames + audioBuffer.length
  const bytesPerSample = 2
  const blockAlign = channels * bytesPerSample
  const dataSize = totalFrames * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  const channelData = Array.from({ length: channels }, (_, index) => audioBuffer.getChannelData(index))
  let offset = 44
  for (let frame = 0; frame < totalFrames; frame += 1) {
    const sourceFrame = frame - silenceFrames
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = sourceFrame < 0 ? 0 : channelData[channel][sourceFrame] ?? 0
      const clamped = Math.max(-1, Math.min(1, sample))
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
      offset += bytesPerSample
    }
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

async function addSilencePreroll(blob: Blob, silenceSeconds: number) {
  const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext
  if (!AudioContextCtor) return blob

  const audioContext = new AudioContextCtor()
  try {
    const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer())
    return encodeWavWithSilence(audioBuffer, silenceSeconds)
  } finally {
    void audioContext.close().catch(() => {})
  }
}

async function createPlayableAudioUrl(audioUrl: string) {
  if (!audioUrl.startsWith('data:audio/')) return { url: audioUrl, revoke: null as (() => void) | null }

  const response = await fetch(audioUrl)
  const blob = await response.blob()
  const playableBlob = isCoarsePointerDevice()
    ? await addSilencePreroll(blob, 0.18).catch(() => blob)
    : blob
  const objectUrl = URL.createObjectURL(playableBlob)
  return {
    url: objectUrl,
    revoke: () => URL.revokeObjectURL(objectUrl),
  }
}

function playAudioToEnd(
  audioUrl: string,
  options?: {
    audio?: HTMLAudioElement
    playbackNodesRef?: { current: PlaybackAudioNodes | null }
    onLevel?: (level: number | null) => void
    speed?: number
  },
) {
  return new Promise<void>((resolve, reject) => {
    const audio = options?.audio ?? new Audio()
    const playbackRate = normalizePlaybackRate(options?.speed)
    audio.crossOrigin = 'anonymous'
    audio.preload = 'auto'
    audio.playbackRate = playbackRate
    audio.setAttribute('playsinline', 'true')
    let settled = false
    let timeout: number | null = null
    let startTimeout: number | null = null
    let stopLevelSampler: AudioLevelStop | null = null
    let revokePlayableUrl: (() => void) | null = null
    let playbackStarted = false

    function cleanup() {
      audio.onended = null
      audio.onerror = null
      audio.onloadedmetadata = null
      audio.onloadeddata = null
      audio.oncanplay = null
      stopLevelSampler?.()
      stopLevelSampler = null
      if (timeout) {
        window.clearTimeout(timeout)
        timeout = null
      }
      if (startTimeout) {
        window.clearTimeout(startTimeout)
        startTimeout = null
      }
      revokePlayableUrl?.()
      revokePlayableUrl = null
    }

    function settle(callback: () => void) {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }

    function armTimeout(ms: number) {
      if (timeout) window.clearTimeout(timeout)
      timeout = window.setTimeout(() => settle(resolve), ms)
    }

    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        armTimeout((audio.duration * 1000 / playbackRate) + 2000)
      }
    }
    audio.onended = () => settle(resolve)
    audio.onerror = () => settle(() => reject(new Error('Audio playback failed')))

    function startPlayback() {
      if (playbackStarted || settled) return
      playbackStarted = true
      const delayMs = getPlaybackStartDelayMs()
      startTimeout = window.setTimeout(() => {
        startTimeout = null
        try {
          audio.currentTime = 0
        } catch {}
        audio.play().catch(error => {
          if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
            settle(() => reject(new PlaybackBlockedError(audioUrl)))
            return
          }
          settle(() => reject(error))
        })
      }, delayMs)
    }

    audio.onloadeddata = startPlayback
    audio.oncanplay = startPlayback
    armTimeout(45000)
    if (options?.onLevel && options.playbackNodesRef) {
      const levelSource = getPlaybackLevelSource(audio, options.playbackNodesRef, options.onLevel)
      if (levelSource) {
        stopLevelSampler = sampleAudioLevel(levelSource, options.onLevel)
      }
    }

    void createPlayableAudioUrl(audioUrl)
      .then(playable => {
        if (settled) {
          playable.revoke?.()
          return
        }
        revokePlayableUrl = playable.revoke
        audio.src = playable.url
        audio.load()
      })
      .catch(error => {
        settle(() => reject(error))
      })
  })
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
  const [ttsVoiceId, setTtsVoiceId] = useState<string | null>(null)
  const [ttsPreferenceLoaded, setTtsPreferenceLoaded] = useState(false)
  const [voiceLevel, setVoiceLevel] = useState<number | null>(null)
  const [playbackBlocked, setPlaybackBlocked] = useState(false)

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
  const ttsSpeedRef = useRef(ttsSpeed)
  const ttsVoiceIdRef = useRef<string | null>(null)
  const activeSessionRef = useRef(initialState.isSessionActive)
  const activeTurnRef = useRef(0)
  const canListenOnRouteRef = useRef(isSessionRoute)
  const routePausedRef = useRef(initialState.isRoutePaused)
  const abortListeningRef = useRef<AbortController | null>(null)
  const simulateTurnRef = useRef<(turnId: number) => void>(() => {})
  const correctionHistoryRef = useRef<ConversationResponse['corrections']>(initialState.corrections)
  const stopVoiceLevelRef = useRef<AudioLevelStop | null>(null)
  const voiceActivityRef = useRef<VoiceActivitySnapshot>(createVoiceActivitySnapshot())
  const voiceLevelRequestRef = useRef(0)
  const listeningStartMsRef = useRef(0)
  const pendingEndpointTranscriptRef = useRef('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playbackNodesRef = useRef<PlaybackAudioNodes | null>(null)
  const audioUnlockedRef = useRef(false)
  const pendingPlaybackRef = useRef<PendingPlayback | null>(null)

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
    fetch('/api/preferences')
      .then(res => res.json())
      .then((data: { tts_provider?: string; tts_speed?: number; tts_voice_id?: string | null }) => {
        if (data.tts_provider) setTtsProvider(data.tts_provider)
        if ('tts_voice_id' in data) setTtsVoiceId(data.tts_voice_id ?? null)
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

  const updateSnapshot = useCallback((updater: (current: WorkflowSnapshot) => WorkflowSnapshot) => {
    const next = updater(snapshotRef.current)
    snapshotRef.current = next
    setSnapshot(next)
  }, [])

  const applyTransition = useCallback((to: WorkflowState, patch: Partial<WorkflowSnapshot> = {}) => {
    updateSnapshot(prev => transition(prev, to, { ...patch }))
  }, [updateSnapshot])

  const stopVoiceLevelSampling = useCallback(() => {
    voiceLevelRequestRef.current += 1
    stopVoiceLevelRef.current?.()
    stopVoiceLevelRef.current = null
    voiceActivityRef.current = createVoiceActivitySnapshot()
    setVoiceLevel(null)
  }, [])

  const getSessionAudio = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio()
      audio.crossOrigin = 'anonymous'
      audio.preload = 'auto'
      audio.setAttribute('playsinline', 'true')
      audioRef.current = audio
    }
    return audioRef.current
  }, [])

  const unlockSessionAudio = useCallback(() => {
    if (audioUnlockedRef.current) return
    const audio = getSessionAudio()
    audio.muted = true
    audio.src = silentAudioUrl
    audio.load()
    const levelSource = getPlaybackLevelSource(audio, playbackNodesRef, () => {})
    if (levelSource) {
      void levelSource.audioContext.resume().catch(() => {})
    }
    void audio.play()
      .then(() => {
        audio.pause()
        audio.currentTime = 0
        audio.muted = false
        audioUnlockedRef.current = true
        if (playbackNodesRef.current) {
          void playbackNodesRef.current.audioContext.resume().catch(() => {})
        }
      })
      .catch(() => {
        audio.muted = false
        audioUnlockedRef.current = false
      })
  }, [getSessionAudio])

  const resolvePendingPlayback = useCallback(() => {
    pendingPlaybackRef.current?.resolve()
    pendingPlaybackRef.current = null
    setPlaybackBlocked(false)
  }, [])

  const closePlaybackAudioContext = useCallback(() => {
    const playbackNodes = playbackNodesRef.current
    playbackNodesRef.current = null
    if (playbackNodes) {
      void playbackNodes.audioContext.close().catch(() => {})
    }
  }, [])

  const waitForBlockedPlayback = useCallback((
    audioUrl: string,
    onLevel?: (level: number | null) => void,
    speed?: number,
  ) => {
    setPlaybackBlocked(true)
    return new Promise<void>(resolve => {
      pendingPlaybackRef.current = { audioUrl, onLevel, speed, resolve }
    })
  }, [])

  const playBlockedReply = useCallback(() => {
    const pending = pendingPlaybackRef.current
    if (!pending) return
    setPlaybackBlocked(false)
    void playAudioToEnd(pending.audioUrl, {
      audio: getSessionAudio(),
      playbackNodesRef,
      onLevel: pending.onLevel,
      speed: pending.speed,
    })
      .then(resolvePendingPlayback)
      .catch(error => {
        if (error instanceof PlaybackBlockedError) {
          setPlaybackBlocked(true)
          return
        }
        resolvePendingPlayback()
      })
  }, [getSessionAudio, resolvePendingPlayback])

  const startListeningLevelSampling = useCallback((turnId: number) => {
    stopVoiceLevelSampling()
    const requestId = voiceLevelRequestRef.current
    void createMicLevelSampler(level => {
      if (
        canSampleListeningLevel({
          activeSession: activeSessionRef.current,
          activeTurnId: activeTurnRef.current,
          currentTurnId: turnId,
          canListenOnRoute: canListenOnRouteRef.current,
          workflowState: snapshotRef.current.state,
        })
      ) {
        voiceActivityRef.current = updateVoiceActivitySnapshot(voiceActivityRef.current, { level })
        setVoiceLevel(level)
      }
    }).then(stop => {
      if (!stop) return
      if (
        voiceLevelRequestRef.current !== requestId ||
        !canSampleListeningLevel({
          activeSession: activeSessionRef.current,
          activeTurnId: activeTurnRef.current,
          currentTurnId: turnId,
          canListenOnRoute: canListenOnRouteRef.current,
          workflowState: snapshotRef.current.state,
        })
      ) {
        stop()
        return
      }
      stopVoiceLevelRef.current = stop
    })
  }, [stopVoiceLevelSampling])

  useEffect(() => {
    return () => {
      stopVoiceLevelSampling()
      resolvePendingPlayback()
      audioRef.current?.pause()
      closePlaybackAudioContext()
    }
  }, [closePlaybackAudioContext, resolvePendingPlayback, stopVoiceLevelSampling])

  const cancelCurrentTurn = useCallback(() => {
    abortListeningRef.current?.abort()
    abortListeningRef.current = null
    activeTurnRef.current += 1
    stopVoiceLevelSampling()
    resolvePendingPlayback()
  }, [resolvePendingPlayback, stopVoiceLevelSampling])

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
    stopVoiceLevelSampling()
  }, [cancelCurrentTurn, stopVoiceLevelSampling, tr, updateSnapshot])

  const rotateAccent = useCallback((): AccentProfile => {
    const next = pickRandomAccent()
    accentRef.current = next
    setAccent(next)
    setAccentBanner(`${tr('session.accent_changed')} ${next.name}`)
    return next
  }, [tr])

  const speakText = useCallback(async (text: string, accentName: string) => {
    const updatePlaybackLevel = (level: number | null) => {
      if (canSamplePlaybackLevel({
        activeSession: activeSessionRef.current,
        activeTurnId: activeTurnRef.current,
        currentTurnId: activeTurnRef.current,
        canListenOnRoute: canListenOnRouteRef.current,
        workflowState: snapshotRef.current.state,
      })) {
        setVoiceLevel(level)
      }
    }

    try {
      const provider = ttsProviderRef.current
      const speed = ttsSpeedRef.current
      if (provider === 'mock') {
        setVoiceLevel(null)
        await mockTTS.synthesize(text, { accent: accentName, speed })
        return
      }
      const playTTS = async (speechText: string) => {
        const speedRouting = getTTSSpeedRouting(provider, speed)
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: speechText, accent: accentName, provider, speed: speedRouting.serverSpeed, voiceId: ttsVoiceIdRef.current }),
        })
        const result = await res.json() as { audioUrl?: string; error?: string }
        if (!res.ok) throw new Error(result.error || `TTS request failed: ${res.status}`)
        if (!result.audioUrl) throw new Error('TTS response did not include audioUrl')

        try {
          await playAudioToEnd(result.audioUrl, {
            audio: getSessionAudio(),
            playbackNodesRef,
            onLevel: updatePlaybackLevel,
            speed: speedRouting.playbackRate,
          })
        } catch (error) {
          if (error instanceof PlaybackBlockedError) {
            setStatusText(tr('session.playback_blocked'))
            await waitForBlockedPlayback(error.audioUrl, updatePlaybackLevel, speedRouting.playbackRate)
            return
          }
          throw error
        }
      }

      await playTTS(text)
    } catch {
      setVoiceLevel(null)
      await mockTTS.synthesize(text, { accent: accentName, speed: ttsSpeedRef.current })
    } finally {
      setVoiceLevel(null)
    }
  }, [getSessionAudio, tr, waitForBlockedPlayback])

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
    unlockSessionAudio()
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
    listeningStartMsRef.current = 0
    pendingEndpointTranscriptRef.current = ''
    startNextTurn()
  }, [startNextTurn, tr, ttsPreferenceLoaded, unlockSessionAudio])

  const endSession = useCallback(async () => {
    activeSessionRef.current = false
    routePausedRef.current = false
    setIsRoutePaused(false)
    cancelCurrentTurn()
    setIsSessionActive(false)
    applyTransition('session_ended')
    setStatusText(tr('session.ended'))
    stopVoiceLevelSampling()
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
  }, [applyTransition, cancelCurrentTurn, stopVoiceLevelSampling, tr])

  const continueSpeaking = useCallback(() => {
    unlockSessionAudio()
    activeSessionRef.current = true
    if (!canListenOnRouteRef.current) {
      setStatusText(tr('session.paused'))
      return
    }
    listeningStartMsRef.current = 0
    pendingEndpointTranscriptRef.current = ''
    startNextTurn()
  }, [startNextTurn, tr, unlockSessionAudio])

  const playCorrection = useCallback((text: string) => {
    void speakText(text, accentRef.current.name)
  }, [speakText])

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
        startListeningLevelSampling(turnId)
        const browserSTT = createBrowserSTT()
        const result = await browserSTT.transcribe(new Blob(), {
          signal: abortController.signal,
          language: 'en-US',
          getVoiceActivity: () => voiceActivityRef.current,
        })
        if (!canContinueListening()) return
        transcript = result.transcript
      } catch {
        stopVoiceLevelSampling()
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
      stopVoiceLevelSampling()
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
    stopVoiceLevelSampling()
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: t, messages: ctx.messages, scenario: ctx.scenario }),
        })
        if (!res.ok) throw new Error('Semantic check failed')
        const data = await res.json() as { judgment: 'done' | 'thinking' }
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
    const newAccent = currentSnapshot.turnNumber > 0 && currentSnapshot.turnNumber % 3 === 0 ? rotateAccent() : currentAccent
    const currentScenario = scenarioRef.current

    setStatusText(tr('session.preparing_reply'))
    updateSnapshot(current => requestCoachReply(current))
    let response: ConversationResponse
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: acceptedTurn.messages,
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
    setVoiceLevel(null)
    await speakText(response.text, newAccent.name)
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
    voiceLevel,
    playbackBlocked,
    configureSession,
    startSession,
    endSession,
    continueSpeaking,
    playBlockedReply,
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
    playbackBlocked,
    playBlockedReply,
    playCorrection,
    scenario,
    snapshot,
    startSession,
    statusText,
    summary,
    ttsPreferenceLoaded,
    voiceLevel,
  ])

  return (
    <VoiceSessionContext.Provider value={value}>
      {children}
    </VoiceSessionContext.Provider>
  )
}
