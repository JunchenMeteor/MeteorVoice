import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { advancePlaybackQueue, getPlaybackCompletionEffects, type PlaybackQueueSnapshot } from '@meteorvoice/session-core'
import { shouldResumeListening } from '../sessionRuntime'

export interface PlaybackQueueDeps {
  audio: {
    isPlaying: boolean
    didJustFinish: boolean
    isRecording: boolean
    playbackDurationSeconds: number
    playbackRemainingMs: number | null
  }
  audioUrl: string | null
  playbackQueue: PlaybackQueueSnapshot
  setPlaybackQueue: Dispatch<SetStateAction<PlaybackQueueSnapshot>>
  setAudioUrl: Dispatch<SetStateAction<string | null>>
  logVoiceMetric: (stage: string, data?: Record<string, unknown>) => void
  setStatus: (status: string) => void
  cancelListeningForReason: (reason: string) => Promise<void>
  scheduleResumeListening: (delayMs?: number, updateStatus?: boolean) => void
  clearResumeListeningTimer: () => void
  listeningStartupStatus: (provider?: string) => string
  // Refs
  playbackActiveRef: React.MutableRefObject<boolean>
  playbackStartedRef: React.MutableRefObject<boolean>
  playbackEndedAtMsRef: React.MutableRefObject<number | null>
  audioPlayingRef: React.MutableRefObject<boolean>
  isCorrectionPlayingRef: React.MutableRefObject<boolean>
  sttPrewarmAudioUrlRef: React.MutableRefObject<string | null>
  busyRef: React.MutableRefObject<boolean>
  sessionActiveRef: React.MutableRefObject<boolean>
  routePresenceRef: React.MutableRefObject<import('../sessionRuntime').SessionRoutePresence>
  canListenOnRouteRef: React.MutableRefObject<boolean>
  sessionGenerationRef: React.MutableRefObject<number>
  speechStartListeningRef: React.MutableRefObject<(lang?: string) => Promise<boolean>>
}

export function usePlaybackQueue(deps: PlaybackQueueDeps): void {
  const {
    audio, audioUrl, playbackQueue, setPlaybackQueue, setAudioUrl,
    logVoiceMetric, setStatus,
    cancelListeningForReason, scheduleResumeListening, clearResumeListeningTimer,
    playbackActiveRef, playbackStartedRef, playbackEndedAtMsRef, audioPlayingRef,
    isCorrectionPlayingRef, sttPrewarmAudioUrlRef, busyRef, sessionActiveRef,
    routePresenceRef, canListenOnRouteRef, sessionGenerationRef,
  } = deps

  // Sync audio playing state and cancel listening when playback starts
  useEffect(() => {
    audioPlayingRef.current = audio.isPlaying
    if (audio.isPlaying && audioUrl && playbackActiveRef.current && !playbackStartedRef.current) {
      playbackStartedRef.current = true
      sttPrewarmAudioUrlRef.current = null
      logVoiceMetric('playback_started', { audioUrl })
      void cancelListeningForReason('playback_started')
    }
  }, [audio.isPlaying, audioUrl, cancelListeningForReason, logVoiceMetric,
    audioPlayingRef, playbackActiveRef, playbackStartedRef, sttPrewarmAudioUrlRef])

  // Audio playback completion handler
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
        const resumeGate = {
          sessionActive: sessionActiveRef.current,
          routePresence: routePresenceRef.current,
          canListenOnRoute: canListenOnRouteRef.current,
          busy: busyRef.current,
          playbackActive: playbackActiveRef.current,
          audioPlaying: audioPlayingRef.current,
          generation: sessionGenerationRef.current,
          currentGeneration: sessionGenerationRef.current,
        }
        setStatus(shouldResumeListening(resumeGate)
          ? 'session.status.listening'
          : 'session.status.reply_played')
        if (shouldResumeListening(resumeGate)) {
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
        void cancelListeningForReason('play_next_audio')
        setStatus('session.status.playing_reply')
        setAudioUrl(nextQueue.currentAudioUrl)
        return
      }

      playbackActiveRef.current = false
      playbackStartedRef.current = false
      playbackEndedAtMsRef.current = Date.now()
      logVoiceMetric('playback_finished', { audioUrl })
      setStatus('session.status.reply_played')
      const resumeGate = {
        sessionActive: sessionActiveRef.current,
        routePresence: routePresenceRef.current,
        canListenOnRoute: canListenOnRouteRef.current,
        busy: busyRef.current,
        playbackActive: playbackActiveRef.current,
        audioPlaying: audioPlayingRef.current,
        generation: sessionGenerationRef.current,
        currentGeneration: sessionGenerationRef.current,
      }
      if (shouldResumeListening(resumeGate)) {
        scheduleResumeListening()
      }
    }

    const timeout = setTimeout(advanceQueue, 0)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [
    audio.didJustFinish, audio.isPlaying, audioUrl, playbackQueue, cancelListeningForReason,
    clearResumeListeningTimer, logVoiceMetric, scheduleResumeListening, setStatus,
    setPlaybackQueue, setAudioUrl,
    playbackActiveRef, playbackStartedRef, playbackEndedAtMsRef, audioPlayingRef,
    isCorrectionPlayingRef, busyRef, sessionActiveRef, routePresenceRef,
    canListenOnRouteRef, sessionGenerationRef,
  ])
}
