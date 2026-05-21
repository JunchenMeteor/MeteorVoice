import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'

type NativeAudioPermission = 'unknown' | 'granted' | 'denied'

type NativeAudioPhase =
  | 'idle'
  | 'requesting-permission'
  | 'recording'
  | 'recorded'
  | 'playing'
  | 'paused'
  | 'blocked'
  | 'error'

const playbackAudioMode = {
  allowsRecording: false,
  interruptionMode: 'doNotMix' as const,
  playsInSilentMode: true,
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
}

const recordingAudioMode = {
  ...playbackAudioMode,
  allowsRecording: true,
}

export function useNativeSessionAudio(audioUrl: string | null) {
  const [permission, setPermission] = useState<NativeAudioPermission>('unknown')
  const [phase, setPhase] = useState<NativeAudioPhase>('idle')
  const [lastRecordingUri, setLastRecordingUri] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const operationRef = useRef<Promise<unknown> | null>(null)

  const player = useAudioPlayer(audioUrl, { downloadFirst: true, updateInterval: 250 })
  const playerStatus = useAudioPlayerStatus(player)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
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
  }, [])

  const configureRecording = useCallback(async () => {
    await setAudioModeAsync(recordingAudioMode)
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
  }, [configurePlayback, configureRecording, playerStatus.playing, recorder, runExclusive])

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
        player.seekTo(0)
        player.play()
        setPhase('playing')
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Coach voice failed to play'
        setErrorMessage(message)
        setPhase('error')
        return false
      }
    })
  }, [audioUrl, configurePlayback, player, recorder, recorderState.isRecording, runExclusive])

  useEffect(() => {
    void configurePlayback().catch(() => {})
  }, [configurePlayback])

  useEffect(() => {
    if (!audioUrl) return
    void configurePlayback()
      .then(() => {
        player.seekTo(0)
        player.play()
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : 'Coach voice failed to play'
        setErrorMessage(message)
        setPhase('error')
      })
  }, [audioUrl, configurePlayback, player])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') return

      if (playerStatus.playing) {
        player.pause()
      }

      if (recorder.getStatus().isRecording) {
        void stopRecording()
      }

      setPhase('paused')
    })

    return () => subscription.remove()
  }, [player, playerStatus.playing, recorder, stopRecording])

  return useMemo(() => ({
    durationMillis: recorderState.durationMillis,
    errorMessage,
    isPlaying,
    isRecording,
    lastRecordingUri,
    permission,
    phase: displayPhase,
    playReply,
    startRecording,
    stopRecording,
  }), [
    errorMessage,
    isPlaying,
    isRecording,
    lastRecordingUri,
    permission,
    displayPhase,
    playReply,
    recorderState.durationMillis,
    startRecording,
    stopRecording,
  ])
}
