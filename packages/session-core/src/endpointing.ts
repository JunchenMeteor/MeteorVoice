import type { ConversationMessage } from '@meteorvoice/shared'
import {
  endsWithThinkingFiller,
  looksLikeIncompleteSpeech,
  type VoiceActivitySnapshot,
} from './workflow'

export type EndpointJudgment = 'submit' | 'continue'

export type EndpointJudgmentReason =
  | 'confident_complete'
  | 'confident_incomplete'
  | 'llm_done'
  | 'llm_thinking'
  | 'max_listening_timeout'
  | 'max_silence_timeout'
  | 'no_transcript_yet'

export interface EndpointResult {
  judgment: EndpointJudgment
  reason: EndpointJudgmentReason
}

const COMPLETE_ENDING_PATTERN = /[.!?。！？]$/

const SHORT_COMPLETE_PHRASES = /^(?:yes|no|yeah|nope|ok|okay|sure|right|exactly|absolutely|definitely|maybe|perhaps|please|thanks|thank you|sorry|good|great|fine|got it|I see|I understand|of course|not really|I agree|I don't know|I'm not sure|me too|me neither|never mind|go ahead|let me try|I'll try|hello|hi|bye|goodbye)[\s,，.。!?！？]*$/i

const BASE_WORD_COUNT_FOR_CONFIDENCE = 4
const SHORT_PHRASE_MAX_WORDS = 3

export const DEFAULT_MAX_UTTERANCE_MS = 45000
export const DEFAULT_SEMANTIC_ENDPOINT_TIMEOUT_MS = 1500
export const DEFAULT_MAX_SILENCE_MS = 8000
export const DEFAULT_MAX_LISTENING_MS = DEFAULT_MAX_UTTERANCE_MS
const DEFAULT_PAUSE_DELAY_MS = 500

export type SemanticEndpointCheck = (
  transcript: string,
  context: { messages: ConversationMessage[]; scenario: string },
) => Promise<'done' | 'thinking'>

export interface JudgeEndpointInput {
  transcript: string
  isFinalResult?: boolean
  voiceActivity?: VoiceActivitySnapshot | null
  listeningDurationMs: number
  lastVoiceAtMs?: number | null
  messages?: ConversationMessage[]
  scenario?: string
  semanticCheck?: SemanticEndpointCheck
}

export interface JudgeEndpointOptions {
  nowMs?: number
  maxListeningMs?: number
  maxSilenceMs?: number
  pauseDelayMs?: number
  semanticTimeoutMs?: number
}

/**
 * 三层统一判停入口。
 * session-core 不 import 任何 AI SDK/DeepSeek — LLM 调用由调用方注入。
 */
export async function judgeEndpoint(
  input: JudgeEndpointInput,
  options: JudgeEndpointOptions = {},
): Promise<EndpointResult> {
  const transcript = input.transcript.trim()
  const nowMs = options.nowMs ?? Date.now()
  const maxListeningMs = options.maxListeningMs ?? DEFAULT_MAX_LISTENING_MS
  const maxSilenceMs = options.maxSilenceMs ?? DEFAULT_MAX_SILENCE_MS
  const pauseDelayMs = options.pauseDelayMs ?? DEFAULT_PAUSE_DELAY_MS
  const semanticTimeoutMs = options.semanticTimeoutMs ?? DEFAULT_SEMANTIC_ENDPOINT_TIMEOUT_MS

  // L1: 本地快速判断
  const localJudgment = judgeTurnLocally(transcript)
  if (localJudgment === 'complete') {
    return { judgment: 'submit', reason: 'confident_complete' }
  }
  if (localJudgment === 'incomplete') {
    // 即使 L1 判 incomplete，也不能无限等——检查超时
    if (input.listeningDurationMs >= maxListeningMs && transcript.length > 0) {
      return { judgment: 'submit', reason: 'max_listening_timeout' }
    }
    return { judgment: 'continue', reason: 'confident_incomplete' }
  }

  // 还没有任何有效文本 → 检查最长静默
  if (!transcript) {
    // 完全没说话 + 静默超时 → 提交空内容让上层降级处理
    if (input.lastVoiceAtMs && (nowMs - input.lastVoiceAtMs) >= maxSilenceMs) {
      return { judgment: 'submit', reason: 'max_silence_timeout' }
    }
    return { judgment: 'continue', reason: 'no_transcript_yet' }
  }

  // 安全网：本轮已经听了太久，用户说了足够内容 → 强制提交
  if (input.listeningDurationMs >= maxListeningMs) {
    return { judgment: 'submit', reason: 'max_listening_timeout' }
  }

  // 用户持续不出声 + 有文本 → 检查最长静默
  if (input.lastVoiceAtMs && (nowMs - input.lastVoiceAtMs) >= maxSilenceMs) {
    return { judgment: 'submit', reason: 'max_silence_timeout' }
  }

  // 如果有声学活动数据且最近还在说话 → 继续听
  if (input.voiceActivity?.isVoiceActive) {
    return { judgment: 'continue', reason: 'confident_incomplete' }
  }

  // 如果刚听到人声不久（< pauseDelayMs） → 继续等
  const silenceDuration = input.lastVoiceAtMs ? nowMs - input.lastVoiceAtMs : null
  if (silenceDuration !== null && silenceDuration < pauseDelayMs) {
    return { judgment: 'continue', reason: 'confident_incomplete' }
  }

  // L2: LLM 语义判停（仅在 L1 uncertain + 有足够停顿时）
  if (input.semanticCheck) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    try {
      const llmJudgment = await Promise.race([
        input.semanticCheck(transcript, {
          messages: input.messages ?? [],
          scenario: input.scenario ?? 'general',
        }),
        new Promise<'done'>((resolve) => {
          timeoutId = setTimeout(() => resolve('done'), semanticTimeoutMs)
        }),
      ])
      if (timeoutId !== null) clearTimeout(timeoutId)
      if (llmJudgment === 'done') {
        return { judgment: 'submit', reason: 'llm_done' }
      }
      return { judgment: 'continue', reason: 'llm_thinking' }
    } catch {
      if (timeoutId !== null) clearTimeout(timeoutId)
      return { judgment: 'submit', reason: 'confident_complete' }
    }
  }

  // 没有 LLM 可调用 → 有文本就提交
  if (transcript) {
    return { judgment: 'submit', reason: 'confident_complete' }
  }
  return { judgment: 'continue', reason: 'no_transcript_yet' }
}

/**
 * L1 本地快速判断：complete | incomplete | uncertain
 *
 * - complete: 非常确定用户说完了（标点结尾 + 足够词数 / 短应答）
 * - incomplete: 非常确定用户没说完（filler、trailing conjunction、leading continuation）
 * - uncertain: 正则判断不了，需要上层决策
 */
export function judgeTurnLocally(transcript: string): 'complete' | 'incomplete' | 'uncertain' {
  const normalized = transcript.trim()
  if (!normalized) return 'uncertain'

  // 明确的短应答 → complete（必须在 incomplete 检查前，否则短词会被误判）
  if (SHORT_COMPLETE_PHRASES.test(normalized)) return 'complete'

  // 明确没说完的信号 → incomplete
  if (endsWithThinkingFiller(normalized)) return 'incomplete'
  if (looksLikeIncompleteSpeech(normalized)) return 'incomplete'

  // 标点结尾 — 有足够词数直接 complete，太短判 uncertain
  if (COMPLETE_ENDING_PATTERN.test(normalized)) {
    const wordCount = countWords(normalized)
    return wordCount >= SHORT_PHRASE_MAX_WORDS ? 'complete' : 'uncertain'
  }

  // 足够长的无标点句 → 可能是完整表达，但不能确定
  const wordCount = countWords(normalized)
  if (wordCount >= BASE_WORD_COUNT_FOR_CONFIDENCE) {
    return 'uncertain'
  }

  // 短的无标点句 → 不确定
  return 'uncertain'
}

function countWords(text: string): number {
  return text
    .replace(/[一-鿿]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
}
