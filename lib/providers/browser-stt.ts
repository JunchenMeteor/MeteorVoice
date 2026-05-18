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
    transcribe(): Promise<STTResult> {
      return new Promise((resolve, reject) => {
        const recognition = new SpeechRecognitionCtor()
        recognition.continuous = false
        recognition.interimResults = false
        recognition.lang = 'en-US'

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = Array.from(event.results)
            .map(r => r[0].transcript)
            .join(' ')
          const confidence = event.results[0][0].confidence
          resolve({ transcript: transcript.trim() || '[no speech detected]', confidence })
        }

        recognition.onerror = (event: SpeechRecognitionError) => {
          reject(new Error(`Speech recognition error: ${event.error}`))
        }

        recognition.onend = () => {
          // If no result came back, resolve with empty
          setTimeout(() => {
            resolve({ transcript: '[listening...]', confidence: 0 })
          }, 100)
        }

        try {
          recognition.start()
        } catch (e) {
          reject(new Error(`Failed to start speech recognition: ${e}`))
        }
      })
    },
  }
}
