'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type PlaybackAudioNodes,
  PlaybackBlockedError,
  getPlaybackLevelSource,
  playAudioToEnd,
  silentAudioUrl,
} from '@/lib/audio-engine'
import type { PendingPlayback } from '@/lib/voice-session-types'

export interface PlaybackEngine {
  audioRef: React.RefObject<HTMLAudioElement | null>
  playbackNodesRef: React.RefObject<PlaybackAudioNodes | null>
  playbackBlocked: boolean
  getSessionAudio: () => HTMLAudioElement
  unlockSessionAudio: () => void
  resolvePendingPlayback: () => void
  closePlaybackAudioContext: () => void
  waitForBlockedPlayback: (
    audioUrl: string,
    onLevel?: (level: number | null) => void,
    speed?: number,
  ) => Promise<void>
  playBlockedReply: () => void
}

export function usePlaybackEngine(): PlaybackEngine {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playbackNodesRef = useRef<PlaybackAudioNodes | null>(null)
  const audioUnlockedRef = useRef(false)
  const pendingPlaybackRef = useRef<PendingPlayback | null>(null)
  const [playbackBlocked, setPlaybackBlocked] = useState(false)

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

  useEffect(() => {
    return () => {
      resolvePendingPlayback()
      audioRef.current?.pause()
      closePlaybackAudioContext()
    }
  }, [closePlaybackAudioContext, resolvePendingPlayback])

  return {
    audioRef,
    playbackNodesRef,
    playbackBlocked,
    getSessionAudio,
    unlockSessionAudio,
    resolvePendingPlayback,
    closePlaybackAudioContext,
    waitForBlockedPlayback,
    playBlockedReply,
  }
}
