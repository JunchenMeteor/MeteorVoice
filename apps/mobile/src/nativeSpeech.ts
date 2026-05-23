import { useCallback, useMemo, useState } from 'react'
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorEvent,
} from 'expo-speech-recognition'

export type NativeSpeechPhase =
  | 'idle'
  | 'checking'
  | 'requesting-permission'
  | 'listening'
  | 'stopping'
  | 'unavailable'
  | 'error'

export type NativeSpeechPermission = 'unknown' | 'granted' | 'denied'

export function useNativeSpeech(options: {
  onFinalTranscript?: (transcript: string) => void
} = {}) {
  const [phase, setPhase] = useState<NativeSpeechPhase>('idle')
  const [permission, setPermission] = useState<NativeSpeechPermission>('unknown')
  const [partialTranscript, setPartialTranscript] = useState('')
  const [finalTranscript, setFinalTranscript] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useSpeechRecognitionEvent('start', () => {
    setPhase('listening')
    setErrorMessage(null)
  })

  useSpeechRecognitionEvent('end', () => {
    setPhase(current => current === 'stopping' || current === 'listening' ? 'idle' : current)
  })

  useSpeechRecognitionEvent('result', event => {
    const transcript = event.results[0]?.transcript?.trim() ?? ''
    if (!transcript) return

    if (event.isFinal) {
      setFinalTranscript(transcript)
      setPartialTranscript('')
      setPhase('idle')
      options.onFinalTranscript?.(transcript)
    } else {
      setPartialTranscript(transcript)
    }
  })

  useSpeechRecognitionEvent('error', (event: ExpoSpeechRecognitionErrorEvent) => {
    setPhase(event.error === 'not-allowed' ? 'unavailable' : 'error')
    setErrorMessage(`${event.error}: ${event.message}`)
  })

  const requestPermissions = useCallback(async () => {
    try {
      setPhase('requesting-permission')
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      setPermission(result.granted ? 'granted' : 'denied')
      setPhase(result.granted ? 'idle' : 'unavailable')
      if (!result.granted) {
        setErrorMessage('Speech recognition and microphone permissions are required.')
      }
      return result.granted
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Speech permission request failed'
      setPermission('denied')
      setPhase('error')
      setErrorMessage(message)
      return false
    }
  }, [])

  const isAvailable = useCallback(() => {
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable()
    } catch {
      return false
    }
  }, [])

  const startListening = useCallback(async () => {
    try {
      setPhase('checking')
      setErrorMessage(null)
      setFinalTranscript('')
      setPartialTranscript('')

      if (!isAvailable()) {
        setPhase('unavailable')
        setErrorMessage('Native speech recognition is unavailable on this device or build.')
        return false
      }

      const permissions = await ExpoSpeechRecognitionModule.getPermissionsAsync()
      const granted = permissions.granted || await requestPermissions()
      if (!granted) return false

      setPermission('granted')
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
        contextualStrings: [
          'book a table',
          'reserve a table',
          'practice English',
          'job interview',
          'small talk',
        ],
        androidIntentOptions: {
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1500,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 1300,
        },
      })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Speech recognition failed to start'
      setPhase('error')
      setErrorMessage(message)
      return false
    }
  }, [isAvailable, requestPermissions])

  const stopListening = useCallback(() => {
    try {
      setPhase('stopping')
      ExpoSpeechRecognitionModule.stop()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Speech recognition failed to stop'
      setPhase('error')
      setErrorMessage(message)
    }
  }, [])

  const cancelListening = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.abort()
      setPhase('idle')
      setPartialTranscript('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Speech recognition failed to cancel'
      setPhase('error')
      setErrorMessage(message)
    }
  }, [])

  const clearFinalTranscript = useCallback(() => {
    setFinalTranscript('')
  }, [])

  return useMemo(() => ({
    cancelListening,
    clearFinalTranscript,
    errorMessage,
    finalTranscript,
    isAvailable,
    isListening: phase === 'listening' || phase === 'checking' || phase === 'requesting-permission',
    partialTranscript,
    permission,
    phase,
    requestPermissions,
    startListening,
    stopListening,
  }), [
    cancelListening,
    clearFinalTranscript,
    errorMessage,
    finalTranscript,
    isAvailable,
    partialTranscript,
    permission,
    phase,
    requestPermissions,
    startListening,
    stopListening,
  ])
}
