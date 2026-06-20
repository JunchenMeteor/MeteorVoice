/**
 * Endpoint detection — semantic (LLM) and rule-based stop judgment.
 * 判停检测 — 语义（LLM）和规则停判断。
 */
import type { ConversationMessage } from '@meteorvoice/shared'
import {
  type VoiceActivitySnapshot,
} from './workflow'

export type EndpointJudgment = 'submit' | 'continue'

export type EndpointJudgmentReason =
  | 'confident_complete'
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

const SHORT_COMPLETE_PHRASE_LIST = [
  'yes',
  'no',
  'yeah',
  'yep',
  'yup',
  'nope',
  'nah',
  'ok',
  'okay',
  'sure',
  'right',
  'correct',
  'exactly',
  'absolutely',
  'definitely',
  'maybe',
  'perhaps',
  'probably',
  'please',
  'thanks',
  'thank you',
  'sorry',
  'good',
  'great',
  'nice',
  'fine',
  'not bad',
  'not much',
  'pretty good',
  'very good',
  'all good',
  "I'm good",
  'I am good',
  "I'm fine",
  'I am fine',
  "I'm okay",
  'I am okay',
  "I'm ready",
  'I am ready',
  'ready',
  'got it',
  'gotcha',
  'I see',
  'I understand',
  'understood',
  'of course',
  'not really',
  'I agree',
  'I disagree',
  "I don't know",
  "I don't understand",
  "I'm not sure",
  'not sure',
  'me too',
  'me neither',
  'never mind',
  'go ahead',
  'let me try',
  "I'll try",
  'try again',
  'say again',
  'one more time',
  'repeat please',
  'please repeat',
  'hello',
  'hi',
  'hey',
  'good morning',
  'good afternoon',
  'good evening',
  'good night',
  'bye',
  'goodbye',
  '断句',
  '不会用',
  '不会',
  '怎么用',
  '怎么说',
  '什么意思',
  '再说一遍',
  '再来一次',
  '重复一下',
  '帮我改',
  '我不知道',
  '不知道',
  '不懂',
  '没听懂',
  '可以',
  '好的',
  '谢谢',
  '对',
  '不对',
]

const SHORT_COMPLETE_PHRASES = new RegExp(
  `^(?:${SHORT_COMPLETE_PHRASE_LIST.map(escapeRegExp).join('|')})[\\s,，.。!?！？]*$`,
  'i',
)

const SHORT_PHRASE_MAX_WORDS = 3

export const DEFAULT_MAX_UTTERANCE_MS = 45000
export const DEFAULT_SEMANTIC_ENDPOINT_TIMEOUT_MS = 800
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
 * L1: 只做高置信 completed 判断，其余交给 L2/L3。
 * L2: LLM 语义判停。
 * L3: 超时安全网。
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

  // L1: 快通道（只判 definite complete，不再判 incomplete）
  if (isTurnDefinitelyComplete(transcript)) {
    return { judgment: 'submit', reason: 'confident_complete' }
  }

  // 没有任何有效文本
  if (!transcript) {
    if (input.lastVoiceAtMs && (nowMs - input.lastVoiceAtMs) >= maxSilenceMs) {
      return { judgment: 'submit', reason: 'max_silence_timeout' }
    }
    return { judgment: 'continue', reason: 'no_transcript_yet' }
  }

  // L3: 超时安全网
  if (input.listeningDurationMs >= maxListeningMs) {
    return { judgment: 'submit', reason: 'max_listening_timeout' }
  }
  if (input.lastVoiceAtMs && (nowMs - input.lastVoiceAtMs) >= maxSilenceMs) {
    return { judgment: 'submit', reason: 'max_silence_timeout' }
  }

  // 还在说话或刚停 → 继续等
  if (input.voiceActivity?.isVoiceActive) {
    return { judgment: 'continue', reason: 'no_transcript_yet' }
  }
  const silenceDuration = input.lastVoiceAtMs ? nowMs - input.lastVoiceAtMs : null
  if (silenceDuration !== null && silenceDuration < pauseDelayMs) {
    return { judgment: 'continue', reason: 'no_transcript_yet' }
  }

  // L2: LLM 语义判停
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
      return llmJudgment === 'done'
        ? { judgment: 'submit', reason: 'llm_done' }
        : { judgment: 'continue', reason: 'llm_thinking' }
    } catch {
      if (timeoutId !== null) clearTimeout(timeoutId)
      return { judgment: 'submit', reason: 'confident_complete' }
    }
  }

  // 无 LLM → 有文本就提交
  return transcript
    ? { judgment: 'submit', reason: 'confident_complete' }
    : { judgment: 'continue', reason: 'no_transcript_yet' }
}

/**
 * L1 快通道：只判非常确定用户说完了的情况。
 * 不再判 incomplete——所有不确定的 case 走 L2。
 */
export function isTurnDefinitelyComplete(transcript: string): boolean {
  const normalized = transcript.trim()
  if (!normalized) return false

  if (SHORT_COMPLETE_PHRASES.test(normalized)) return true

  if (COMPLETE_ENDING_PATTERN.test(normalized)) {
    const wordCount = countWords(normalized)
    return wordCount >= SHORT_PHRASE_MAX_WORDS
  }

  return false
}

/**
 * Legacy compatibility alias that judges a turn as complete or uncertain using the L1 fast-path heuristic.
 * 向后兼容别名，使用 L1 快通道启发式算法将轮次判断为 complete 或 uncertain。
 */
// 向后兼容别名
export function judgeTurnLocally(transcript: string): 'complete' | 'incomplete' | 'uncertain' {
  if (isTurnDefinitelyComplete(transcript)) return 'complete'
  return 'uncertain'
}

function countWords(text: string): number {
  return text
    .replace(/[一-鿿]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
