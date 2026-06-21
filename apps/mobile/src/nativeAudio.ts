/**
 * Native audio playback and recording hook.
 * 原生音频播放与录音 Hook。
 */

import type { AppStateStatus } from 'react-native'
import { AppState } from 'react-native'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'

import { configureVoiceAudioSession } from './voiceAudioSession'

type NativeAudioPermission = 'unknown' | 'granted' | 'denied'

type NativeAudioPhase =
  | 'idle'
  | 'requesting-permission'
  | 'recording'
  | 'recorded'
  | 'playing'
  | 'paused'
  | 'interrupted'
  | 'blocked'
  | 'error'

const playbackAudioMode = {
  allowsRecording: false,
  interruptionMode: 'doNotMix' as const,
  playsInSilentMode: true,
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
}

const audioExperimentFlags = {
  routePlaybackThroughEarpieceWhenRecording: false,
  useAndroidVoiceCommunicationRecorder: false,
}

const recordingAudioMode = {
  ...playbackAudioMode,
  allowsRecording: true,
  shouldRouteThroughEarpiece: audioExperimentFlags.routePlaybackThroughEarpieceWhenRecording,
}

const voiceCommunicationRecordingPreset = {
  ...RecordingPresets.HIGH_QUALITY,
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    audioSource: 'voice_communication' as const,
  },
}

function normalizePlaybackRate(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.min(1.4, Math.max(0.5, value))
}

export function useNativeSessionAudio(audioUrl: string | null, playbackRateValue = 1) {
  const [permission, setPermission] = useState<NativeAudioPermission>('unknown')
  const [phase, setPhase] = useState<NativeAudioPhase>('idle')
  const [lastRecordingUri, setLastRecordingUri] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [interrupted, setInterrupted] = useState(false)
  const operationRef = useRef<Promise<unknown> | null>(null)
  const interruptedPhaseRef = useRef<NativeAudioPhase | null>(null)
  const playbackRate = normalizePlaybackRate(playbackRateValue)

  const player = useAudioPlayer(audioUrl, { downloadFirst: true, updateInterval: 250 })
  const playerStatus = useAudioPlayerStatus(player)
  const recorder = useAudioRecorder(
    audioExperimentFlags.useAndroidVoiceCommunicationRecorder
      ? voiceCommunicationRecordingPreset
      : RecordingPresets.HIGH_QUALITY,
  )
  const recorderState = useAudioRecorderState(recorder, 250)

  const isRecording = recorderState.isRecording
  const isPlaying = playerStatus.playing
  const displayPhase: NativeAudioPhase = playerStatus.playing
    ? 'playing'
    : phase === 'playing'
      ? 'idle'
      : phase

  const configurePlayback = useCallback(async () => {
    await setAudioModeAsync(playbackAudioMode)
    await configureVoiceAudioSession({ mode: 'playback' }).catch(() => undefined)
  }, [])

  const applyPlaybackRate = useCallback(() => {
    player.setPlaybackRate(playbackRate, 'high')
  }, [playbackRate, player])

  const configureRecording = useCallback(async () => {
    await setAudioModeAsync(recordingAudioMode)
    await configureVoiceAudioSession({
      mode: 'recording',
      allowBluetooth: true,
      defaultToSpeaker: true,
    }).catch(() => undefined)
  }, [])

  const runExclusive = useCallback(async <T,>(operation: () => Promise<T>) => {
    if (operationRef.current) {
      setPhase('blocked')
      setErrorMessage('Audio operation already in progress.')
      return null
    }

    const task = operation()
    operationRef.current = task
    try {
      return await task
    } finally {
      if (operationRef.current === task) {
        operationRef.current = null
      }
    }
  }, [])

  const stopRecording = useCallback(async () => {
    return runExclusive(async () => {
      if (!recorderState.isRecording) {
        return lastRecordingUri
      }

      try {
        await recorder.stop()
        const status = recorder.getStatus()
        const recordingUri = status.url ?? recorder.uri ?? null
        setLastRecordingUri(recordingUri)
        setPhase(recordingUri ? 'recorded' : 'idle')
        await configurePlayback()
        return recordingUri
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Recording failed to stop'
        setErrorMessage(message)
        setPhase('error')
        await configurePlayback().catch(() => {})
        return null
      }
    })
  }, [configurePlayback, lastRecordingUri, recorder, recorderState.isRecording, runExclusive])

  const startRecording = useCallback(async () => {
    return runExclusive(async () => {
      if (playerStatus.playing) {
        setPhase('blocked')
        setErrorMessage('Wait until coach voice finishes before recording.')
        return false
      }
      if (interrupted) {
        setPhase('blocked')
        setErrorMessage('Audio was interrupted. Resume the session first.')
        return false
      }

      try {
        setErrorMessage(null)
        setPhase('requesting-permission')
        const permissionResponse = await requestRecordingPermissionsAsync()

        if (!permissionResponse.granted) {
          setPermission('denied')
          setPhase('blocked')
          setErrorMessage('Microphone permission is required for native recording.')
          await configurePlayback()
          return false
        }

        setPermission('granted')
        setLastRecordingUri(null)
        await configureRecording()
        await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY)
        recorder.record()
        setInterrupted(false)
        setPhase('recording')
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Recording failed to start'
        setErrorMessage(message)
        setPhase('error')
        await configurePlayback().catch(() => {})
        return false
      }
    })
  }, [configurePlayback, configureRecording, interrupted, playerStatus.playing, recorder, runExclusive])

  const playReply = useCallback(async () => {
    return runExclusive(async () => {
      if (!audioUrl) return false

      try {
        setErrorMessage(null)

        if (recorderState.isRecording) {
          await recorder.stop()
          const status = recorder.getStatus()
          const recordingUri = status.url ?? recorder.uri ?? null
          setLastRecordingUri(recordingUri)
        }

        await configurePlayback()
        applyPlaybackRate()
        player.seekTo(0)
        player.play()
        setInterrupted(false)
        setPhase('playing')
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Coach voice failed to play'
        setErrorMessage(message)
        setPhase('error')
        return false
      }
    })
  }, [applyPlaybackRate, audioUrl, configurePlayback, player, recorder, recorderState.isRecording, runExclusive])

  const stopPlayback = useCallback(() => {
    try {
      player.pause()
      player.seekTo(0)
      if (phase === 'playing') setPhase('idle')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Coach voice failed to stop'
      setErrorMessage(message)
      setPhase('error')
    }
  }, [phase, player])

  // 中断后恢复：清除中断标记，允许继续操作
  const resumeAfterInterruption = useCallback(async () => {
    if (!interrupted) return false

    setInterrupted(false)
    interruptedPhaseRef.current = null
    setErrorMessage(null)

    // 如果中断前在播放，尝试配置播放模式
    await configurePlayback().catch(() => {})
    setPhase('idle')
    return true
  }, [configurePlayback, interrupted])

  useEffect(() => {
    void configurePlayback().catch(() => {})
  }, [configurePlayback])

  useEffect(() => {
    applyPlaybackRate()
  }, [applyPlaybackRate])

  useEffect(() => {
    if (!audioUrl) return
    void configurePlayback()
      .then(() => {
        applyPlaybackRate()
        player.seekTo(0)
        player.play()
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : 'Coach voice failed to play'
        setErrorMessage(message)
        setPhase('error')
      })
  }, [applyPlaybackRate, audioUrl, configurePlayback, player])

  // 前后台切换：后台时暂停音频，前台时检查权限恢复
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        // 前台：静默检查麦克风权限是否恢复
        void getRecordingPermissionsAsync().then(response => {
          setPermission(response.granted ? 'granted' : 'denied')
          if (response.granted) setErrorMessage(null)
        })
        return
      }

      // 后台：暂停播放和录音，标记为中断
      const wasPlaying = playerStatus.playing
      const wasRecording = recorder.getStatus().isRecording

      if (wasPlaying) {
        player.pause()
        interruptedPhaseRef.current = 'playing'
      }

      if (wasRecording) {
        void stopRecording()
        if (!wasPlaying) interruptedPhaseRef.current = 'recording'
      }

      if (wasPlaying || wasRecording) {
        setInterrupted(true)
        setPhase('interrupted')
        setErrorMessage(
          wasPlaying
            ? 'Playback interrupted. Tap to resume and continue.'
            : 'Recording interrupted by system event.',
        )
      } else {
        setPhase('paused')
      }
    })

    return () => subscription.remove()
  }, [player, playerStatus.playing, recorder, stopRecording])

  return useMemo(() => ({
    currentTimeSeconds: playerStatus.currentTime,
    didJustFinish: playerStatus.didJustFinish,
    playbackDurationSeconds: playerStatus.duration,
    durationMillis: recorderState.durationMillis,
    errorMessage,
    interrupted,
    isPlaying,
    isRecording,
    lastRecordingUri,
    permission,
    playbackRemainingMs: playerStatus.playing && playerStatus.duration > 0
      ? Math.max(0, (playerStatus.duration - playerStatus.currentTime) * 1000)
      : null,
    phase: displayPhase,
    playReply,
    resumeAfterInterruption,
    startRecording,
    stopPlayback,
    stopRecording,
  }), [
    errorMessage,
    interrupted,
    isPlaying,
    isRecording,
    lastRecordingUri,
    permission,
    playerStatus.didJustFinish,
    playerStatus.currentTime,
    playerStatus.duration,
    playerStatus.playing,
    displayPhase,
    playReply,
    resumeAfterInterruption,
    recorderState.durationMillis,
    startRecording,
    stopPlayback,
    stopRecording,
  ])
}
