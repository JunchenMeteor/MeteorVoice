export type {
  ConversationContext,
  ConversationMessage,
  ConversationResponse,
  CorrectionItem,
  CorrectionSeverity,
  CorrectionType,
  STTResult,
  TTSResult,
  STTProvider,
  TTSProvider,
} from '@meteorvoice/shared'

import type { ConversationContext, ConversationMessage, ConversationResponse } from '@meteorvoice/shared'

export interface AIProvider {
  generateReply(messages: ConversationMessage[], context: ConversationContext): Promise<ConversationResponse>
}
