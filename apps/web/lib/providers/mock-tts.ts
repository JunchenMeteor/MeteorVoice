import { sleep } from '@meteorvoice/shared/utils'
import type { TTSProvider, TTSResult } from './types'

export function createMockTTS(): TTSProvider {
  return {
    async synthesize(text: string, options?: { accent?: string; speed?: number }): Promise<TTSResult> {
      const speed = options?.speed ?? 1
      // Use browser SpeechSynthesis if available, otherwise just return mock
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        await speakWithBrowserTTS(text, speed)
      } else {
        await sleep(200 + (text.length * 30) / speed)
      }
      return { audioUrl: '', duration: (text.length * 0.06) / speed }
    },
  }
}

function speakWithBrowserTTS(text: string, speed: number) {
  return new Promise<void>(resolve => {
    const synth = window.speechSynthesis
    const utterance = new SpeechSynthesisUtterance(text)
    const fallback = window.setTimeout(() => resolve(), Math.max(1200, (text.length * 80) / speed))

    function finish() {
      window.clearTimeout(fallback)
      resolve()
    }

    utterance.rate = Math.max(0.5, Math.min(1.4, speed))
    utterance.pitch = 1.0
    utterance.onend = finish
    utterance.onerror = finish

    try {
      synth.cancel()
      synth.speak(utterance)
      if (synth.paused) synth.resume()
    } catch {
      finish()
    }
  })
}

