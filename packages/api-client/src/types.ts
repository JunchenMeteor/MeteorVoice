import type {
  ConversationContext,
  ConversationMessage,
  ConversationResponse,
  CorrectionItem,
  TTSResult,
} from '@meteorvoice/shared'

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type ApiClientOptions = {
  baseUrl?: string
  fetch?: FetchLike
  headers?: HeadersInit
}

export type ApiErrorBody = {
  error: string
}

export type PreferencesResponse = {
  tts_provider?: string
  available_providers?: string[]
}

export type UpdatePreferencesRequest = {
  tts_provider?: string
}

export type UpdatePreferencesResponse = {
  tts_provider: string
}

export type GenerateCoachReplyRequest = {
  messages: ConversationMessage[]
  context: ConversationContext
}

export type GenerateCoachReplyResponse = ConversationResponse

export type SynthesizeSpeechRequest = {
  text?: string
  accent?: string
  speed?: number
  provider?: string
}

export type SynthesizeSpeechResponse = TTSResult

export type SyncSessionRequest = {
  session_id: string
  scenario: string
  accent: string
  turns: number
  messages: Pick<ConversationMessage, 'role' | 'content'>[]
  corrections: CorrectionItem[]
}

export type SyncSessionResponse = {
  success: true
}

export type GenerateSummaryRequest = {
  sessionId: string
  scenario: string
  messages: Pick<ConversationMessage, 'role' | 'content'>[]
  turnNumber: number
}

export type GenerateSummaryResponse = {
  summary: string
}

export type HistorySession = {
  id: unknown
  scenario: string
  accent: string
  date: string
  status: unknown
  summary: string | null
}

export type ListHistoryResponse = {
  sessions: HistorySession[]
}

export type CreateTurnRequest = {
  session_id: string
  speaker: string
  transcript: string
  corrections?: CorrectionItem[]
}

export type CreateTurnResponse = {
  turn_id?: string
}
