import type { TTSProvider, TTSResult } from './types'

export function createMockTTS(): TTSProvider {
  return {
    async synthesize(text: string): Promise<TTSResult> {
      // Use browser SpeechSynthesis if available, otherwise just return mock
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 0.9
        utterance.pitch = 1.0
        window.speechSynthesis.speak(utterance)
      }
      await sleep(200 + text.length * 30)
      return { audioUrl: '', duration: text.length * 0.06 }
    },
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
