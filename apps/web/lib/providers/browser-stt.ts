import type { STTProvider, STTResult } from './types'
import {
  getSpeechEndpointDelay,
  getVoiceActivityHoldDelay,
  type VoiceActivitySnapshot,
} from '@meteorvoice/session-core'

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionError extends Event {
  error: string
  message: string
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionError) => void) | null
  onend: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
}

const MAX_DURATION = 30000
const RESTART_AFTER_BROWSER_END_DELAY = 120
const debugVadStorageKey = 'meteorvoice-debug-vad'

function debugVad(event: string, details: Record<string, unknown>) {
  if (typeof window === 'undefined' || window.localStorage.getItem(debugVadStorageKey) !== 'true') return
  console.debug('[MeteorVoice VAD]', event, details)
}

export function browserSTTSupported(): boolean {
  return !!(typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition))
}

export function createBrowserSTT(): STTProvider {
  const SpeechRecognitionCtor = (typeof window !== 'undefined'
    ? window.SpeechRecognition ?? window.webkitSpeechRecognition
    : null) as (new () => SpeechRecognitionInstance) | null

  if (!SpeechRecognitionCtor) {
    throw new Error('SpeechRecognition not available')
  }

  return {
    transcribe(
      _audioBlob: Blob,
      options?: {
        signal?: AbortSignal
        language?: string
        getVoiceActivity?: () => VoiceActivitySnapshot | null
      },
    ): Promise<STTResult> {
      void _audioBlob
      return new Promise((resolve, reject) => {
        const recognition = new SpeechRecognitionCtor()
        recognition.continuous = true
        recognition.interimResults = true
        if (options?.language) recognition.lang = options.language

        let settled = false
        let silenceTimer: ReturnType<typeof setTimeout> | null = null
        let maxTimer: ReturnType<typeof setTimeout> | null = null
        let lastInterim = ''
        let recognitionRunning = false
        const allResults: string[] = []

        function cleanupAbortListener() {
          options?.signal?.removeEventListener('abort', abort)
        }

        function clearSilenceTimer() {
          if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null }
        }

        function abort() {
          if (settled) return
          settled = true
          clearSilenceTimer()
          if (maxTimer) { clearTimeout(maxTimer); maxTimer = null }
          recognitionRunning = false
          try { recognition.abort() } catch {}
          cleanupAbortListener()
          reject(new DOMException('Aborted', 'AbortError'))
        }

        function finalize() {
          if (settled) return
          settled = true
          clearSilenceTimer()
          if (maxTimer) { clearTimeout(maxTimer); maxTimer = null }
          recognitionRunning = false
          try { recognition.abort() } catch {}
          cleanupAbortListener()
          const transcript = (allResults.join(' ').trim() || lastInterim.trim())
          if (transcript) {
            resolve({ transcript, confidence: 0.9 })
          } else {
            reject(new Error('No speech detected'))
          }
        }

        maxTimer = setTimeout(() => finalize(), MAX_DURATION)

        function finalizeAfterVoiceHold(holdStartedAt = Date.now()) {
          const voiceActivity = options?.getVoiceActivity?.()
          const voiceHold = getVoiceActivityHoldDelay({
            voiceActivity,
            holdStartedAt,
          })
          debugVad('finalize-check', {
            voiceHold,
            holdAgeMs: Date.now() - holdStartedAt,
            transcript: allResults.join(' ').trim() || lastInterim,
            voiceActivity,
          })
          if (voiceHold > 0) {
            silenceTimer = setTimeout(() => finalizeAfterVoiceHold(holdStartedAt), voiceHold)
            return
          }
          finalize()
        }

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          clearSilenceTimer()
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i]
            if (result.isFinal) {
              allResults.push(result[0].transcript.trim())
            } else {
              lastInterim = result[0].transcript.trim()
            }
          }
          if (allResults.length > 0 || lastInterim) {
            const currentTranscript = allResults.join(' ').trim() || lastInterim
            const voiceActivity = options?.getVoiceActivity?.()
            const endpointDelay = getSpeechEndpointDelay({
              transcript: currentTranscript,
              hasFinalResult: allResults.length > 0,
              voiceActivity,
            })
            debugVad('schedule-finalize', {
              endpointDelay,
              hasFinalResult: allResults.length > 0,
              transcript: currentTranscript,
              voiceActivity,
            })
            silenceTimer = setTimeout(() => {
              finalizeAfterVoiceHold()
            }, endpointDelay)
          }
        }

        recognition.onerror = (event: SpeechRecognitionError) => {
          if (settled) return
          if (event.error === 'no-speech') {
            // Mic works but no speech. Let onend finalize (which will reject).
            return
          }
          if (event.error === 'aborted') return
          settled = true
          if (maxTimer) { clearTimeout(maxTimer); maxTimer = null }
          clearSilenceTimer()
          recognitionRunning = false
          try { recognition.abort() } catch {}
          cleanupAbortListener()

          if (event.error === 'not-allowed') {
            reject(new Error('Microphone permission denied. Please allow mic access in browser settings.'))
          } else if (event.error === 'audio-capture') {
            reject(new Error('No microphone found. Please check your device settings.'))
          } else if (event.error === 'network') {
            reject(new Error('Speech recognition requires a network connection.'))
          } else {
            reject(new Error(`Speech recognition error: ${event.error}`))
          }
        }

        recognition.onend = () => {
          recognitionRunning = false
          if (settled) return
          if (allResults.length > 0 || lastInterim) {
            window.setTimeout(() => {
              if (settled || recognitionRunning) return
              try {
                recognition.start()
                recognitionRunning = true
              } catch {
                if (!settled) finalize()
              }
            }, RESTART_AFTER_BROWSER_END_DELAY)
            return
          }
          setTimeout(() => { if (!settled) finalize() }, 300)
        }

        try {
          if (options?.signal?.aborted) {
            abort()
            return
          }
          options?.signal?.addEventListener('abort', abort, { once: true })
          recognition.start()
          recognitionRunning = true
        } catch (e: unknown) {
          settled = true
          if (maxTimer) { clearTimeout(maxTimer); maxTimer = null }
          cleanupAbortListener()
          const msg = e instanceof DOMException && e.name === 'NotAllowedError'
            ? 'Microphone permission denied. Please allow mic access in browser settings.'
            : `Failed to start speech recognition: ${e}`
          reject(new Error(msg))
        }
      })
    },
  }
}
