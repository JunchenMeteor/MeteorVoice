import type { STTProvider, STTResult } from './types'

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

const SILENCE_TIMEOUT = 1500
const MAX_DURATION = 15000

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
    transcribe(_audioBlob: Blob, options?: { signal?: AbortSignal }): Promise<STTResult> {
      void _audioBlob
      return new Promise((resolve, reject) => {
        const recognition = new SpeechRecognitionCtor()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'

        let settled = false
        let silenceTimer: ReturnType<typeof setTimeout> | null = null
        let maxTimer: ReturnType<typeof setTimeout> | null = null
        let lastInterim = ''
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
          try { recognition.abort() } catch {}
          cleanupAbortListener()
          reject(new DOMException('Aborted', 'AbortError'))
        }

        function finalize() {
          if (settled) return
          settled = true
          clearSilenceTimer()
          if (maxTimer) { clearTimeout(maxTimer); maxTimer = null }
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
            silenceTimer = setTimeout(() => {
              finalize()
            }, SILENCE_TIMEOUT)
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
          if (!settled) {
            setTimeout(() => { if (!settled) finalize() }, 300)
          }
        }

        try {
          if (options?.signal?.aborted) {
            abort()
            return
          }
          options?.signal?.addEventListener('abort', abort, { once: true })
          recognition.start()
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
