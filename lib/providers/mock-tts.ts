import type { TTSProvider, TTSResult } from './types'

export function createMockTTS(): TTSProvider {
  return {
    async synthesize(text: string, options?: { accent?: string; speed?: number }): Promise<TTSResult> {
      const speed = options?.speed ?? 1
      // Use browser SpeechSynthesis if available, otherwise just return mock
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = Math.max(0.5, Math.min(1.4, speed))
        utterance.pitch = 1.0
        window.speechSynthesis.speak(utterance)
      }
      await sleep(200 + (text.length * 30) / speed)
      return { audioUrl: '', duration: (text.length * 0.06) / speed }
    },
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
