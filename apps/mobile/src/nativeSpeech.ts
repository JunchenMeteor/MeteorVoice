import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createVoiceActivitySnapshot,
  FINAL_RESULT_SILENCE_FINALIZE_MS,
  getSpeechEndpointDelay,
  updateVoiceActivitySnapshot,
  type VoiceActivitySnapshot,
} from '@meteorvoice/session-core'
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

const INTERIM_STABLE_SUBMIT_MS = 850

async function waitForRecognizerIdle(timeoutMs = 700) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const state = await ExpoSpeechRecognitionModule.getStateAsync()
      if (state === 'inactive') return true
    } catch {
      return false
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  return false
}

export function useNativeSpeech(options: {
  onFinalTranscript?: (transcript: string) => void
  onMetric?: (stage: string, data?: Record<string, unknown>) => void
} = {}) {
  const { onFinalTranscript, onMetric } = options
  const [phase, setPhase] = useState<NativeSpeechPhase>('idle')
  const [permission, setPermission] = useState<NativeSpeechPermission>('unknown')
  const [partialTranscript, setPartialTranscript] = useState('')
  const [finalTranscript, setFinalTranscript] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const voiceActivityRef = useRef<VoiceActivitySnapshot>(createVoiceActivitySnapshot())
  const finalTranscriptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const interimTranscriptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submittedTranscriptRef = useRef('')
  const speechStartedAtRef = useRef(0)
  const firstPartialAtRef = useRef<number | null>(null)

  const logVoiceMetric = useCallback((stage: string, data: Record<string, unknown> = {}) => {
    if (onMetric) {
      onMetric(stage, data)
      return
    }
    console.info('[voice-metrics]', JSON.stringify({ stage, ts: Date.now(), data }))
  }, [onMetric])

  const clearTranscriptTimers = useCallback(() => {
    if (finalTranscriptTimerRef.current) {
      clearTimeout(finalTranscriptTimerRef.current)
      finalTranscriptTimerRef.current = null
    }
    if (interimTranscriptTimerRef.current) {
      clearTimeout(interimTranscriptTimerRef.current)
      interimTranscriptTimerRef.current = null
    }
  }, [])

  useEffect(() => clearTranscriptTimers, [clearTranscriptTimers])

  const submitRecognizedTranscript = useCallback((transcript: string, source: 'final' | 'interim_stable') => {
    const normalized = transcript.trim()
    if (!normalized || submittedTranscriptRef.current === normalized) return

    submittedTranscriptRef.current = normalized
    clearTranscriptTimers()
    setFinalTranscript(normalized)
    setPartialTranscript('')
    setPhase('idle')

    if (source === 'interim_stable') {
      try {
        ExpoSpeechRecognitionModule.abort()
      } catch {
        // The recognizer may already have ended naturally.
      }
    }

    logVoiceMetric('stt_submit', {
      source,
      chars: normalized.length,
      elapsedMs: speechStartedAtRef.current ? Date.now() - speechStartedAtRef.current : null,
    })
    onFinalTranscript?.(normalized)
  }, [clearTranscriptTimers, logVoiceMetric, onFinalTranscript])

  useSpeechRecognitionEvent('start', () => {
    clearTranscriptTimers()
    submittedTranscriptRef.current = ''
    speechStartedAtRef.current = Date.now()
    firstPartialAtRef.current = null
    logVoiceMetric('stt_start')
    voiceActivityRef.current = updateVoiceActivitySnapshot(voiceActivityRef.current, { level: 1 })
    setPhase('listening')
    setErrorMessage(null)
  })

  useSpeechRecognitionEvent('end', () => {
    setPhase(current => current === 'stopping' || current === 'listening' ? 'idle' : current)
  })

  useSpeechRecognitionEvent('result', event => {
    const transcript = event.results[0]?.transcript?.trim() ?? ''
    if (!transcript) return
    clearTranscriptTimers()
    voiceActivityRef.current = updateVoiceActivitySnapshot(voiceActivityRef.current, { level: 1 })

    if (!firstPartialAtRef.current) {
      firstPartialAtRef.current = Date.now()
      logVoiceMetric('stt_first_partial', {
        elapsedMs: speechStartedAtRef.current ? firstPartialAtRef.current - speechStartedAtRef.current : null,
        chars: transcript.length,
      })
    }

    if (event.isFinal) {
      const endpointDelay = getSpeechEndpointDelay({
        transcript,
        hasFinalResult: true,
        voiceActivity: voiceActivityRef.current,
      })
      const finalDelay = Math.max(0, endpointDelay - FINAL_RESULT_SILENCE_FINALIZE_MS)
      if (finalDelay === 0) {
        submitRecognizedTranscript(transcript, 'final')
      } else {
        finalTranscriptTimerRef.current = setTimeout(() => {
          finalTranscriptTimerRef.current = null
          submitRecognizedTranscript(transcript, 'final')
        }, finalDelay)
      }
    } else {
      setPartialTranscript(transcript)
      interimTranscriptTimerRef.current = setTimeout(() => {
        interimTranscriptTimerRef.current = null
        submitRecognizedTranscript(transcript, 'interim_stable')
      }, INTERIM_STABLE_SUBMIT_MS)
    }
  })

  useSpeechRecognitionEvent('error', (event: ExpoSpeechRecognitionErrorEvent) => {
    clearTranscriptTimers()
    if (event.error === 'aborted') {
      setPhase('idle')
      setErrorMessage(null)
      return
    }
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

  const startListening = useCallback(async (language?: string) => {
    try {
      setPhase('checking')
      setErrorMessage(null)
      setFinalTranscript('')
      setPartialTranscript('')
      submittedTranscriptRef.current = ''
      clearTranscriptTimers()
      voiceActivityRef.current = createVoiceActivitySnapshot()

      if (!isAvailable()) {
        setPhase('unavailable')
        setErrorMessage('Native speech recognition is unavailable on this device or build.')
        return false
      }

      const permissions = await ExpoSpeechRecognitionModule.getPermissionsAsync()
      const granted = permissions.granted || await requestPermissions()
      if (!granted) return false

      setPermission('granted')
      await waitForRecognizerIdle(300)
      ExpoSpeechRecognitionModule.start({
        ...(language ? { lang: language } : {}),
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
        iosCategory: {
          category: 'playAndRecord',
          categoryOptions: ['defaultToSpeaker', 'allowBluetooth'],
          mode: 'default',
        },
        contextualStrings: [
          'book a table',
          'reserve a table',
          'practice English',
          'job interview',
          'small talk',
        ],
      })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Speech recognition failed to start'
      setPhase('error')
      setErrorMessage(message)
      return false
    }
  }, [clearTranscriptTimers, isAvailable, requestPermissions])

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

  const cancelListening = useCallback(async () => {
    try {
      ExpoSpeechRecognitionModule.abort()
      await waitForRecognizerIdle()
      setPhase('idle')
      setPartialTranscript('')
      clearTranscriptTimers()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Speech recognition failed to cancel'
      setPhase('error')
      setErrorMessage(message)
    }
  }, [clearTranscriptTimers])

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
