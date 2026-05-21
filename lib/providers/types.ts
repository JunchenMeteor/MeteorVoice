export type {
  ConversationContext,
  ConversationMessage,
  ConversationResponse,
  CorrectionItem,
  CorrectionSeverity,
  CorrectionType,
  STTResult,
  TTSResult,
} from '@meteorvoice/shared'

import type {
  ConversationContext,
  ConversationMessage,
  ConversationResponse,
  STTResult,
  TTSResult,
} from '@meteorvoice/shared'

export interface STTProvider {
  transcribe(audioBlob: Blob, options?: { signal?: AbortSignal }): Promise<STTResult>
}

export interface TTSProvider {
  synthesize(text: string, options?: { accent?: string; speed?: number }): Promise<TTSResult>
}

export interface AIProvider {
  generateReply(messages: ConversationMessage[], context: ConversationContext): Promise<ConversationResponse>
}
