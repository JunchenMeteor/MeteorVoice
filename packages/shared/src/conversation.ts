/**
 * Conversation message and response types.
 * 对话消息和响应类型。
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type CorrectionType = 'grammar' | 'vocabulary' | 'fluency' | 'pronunciation'

export type CorrectionSeverity = 'minor' | 'moderate' | 'major'

export interface CorrectionItem {
  type: CorrectionType
  originalText: string
  suggestedText: string
  explanation: string
  severity: CorrectionSeverity
}

export interface ConversationResponse {
  text: string
  corrections: CorrectionItem[]
  suggestedReply: string
}

export interface ConversationContext {
  scenario: { name: string; description: string }
  accentProfile: { name: string; region: string }
  sessionId: string
  turnNumber: number
  responseLocale?: 'en' | 'zh'
}
