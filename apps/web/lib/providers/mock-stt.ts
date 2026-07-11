/**
 * Mock STT provider (fallback).
 * Mock 语音识别提供者。
 */

import type {
  STTProvider,
  STTResult,
} from './types'

const mockTranscripts = [
  "I'd like to practice for my upcoming job interview.",
  'Can you tell me more about the weather today?',
  "What's the best way to order food at an Italian restaurant?",
  "I'm preparing for a business meeting tomorrow.",
  'Could you help me improve my English pronunciation?',
]

/**
 * Create a mock Speech-to-Text provider returning canned transcripts for development and testing.
 * 创建返回预设文本的模拟语音识别提供者，用于开发和测试。
 */
export function createMockSTT(): STTProvider {
  return {
    async transcribe(audioBlob: Blob, options?: { signal?: AbortSignal }): Promise<STTResult> {
      void audioBlob
      // Simulate processing delay
      await sleep(300 + Math.random() * 400, options?.signal)
      const transcript = mockTranscripts[Math.floor(Math.random() * mockTranscripts.length)]
      return { transcript, confidence: 0.85 + Math.random() * 0.1 }
    },
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}
