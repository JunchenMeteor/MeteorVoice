import type {
  AccentProfile,
  ConversationContext,
  ConversationMessage,
  ConversationResponse,
  CorrectionItem,
  Scenario,
  TTSResult,
} from '@meteorvoice/shared'

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
export type ApiHeadersProvider = HeadersInit | (() => HeadersInit | Promise<HeadersInit>)

export type ApiClientOptions = {
  baseUrl?: string
  fetch?: FetchLike
  headers?: ApiHeadersProvider
}

export type ApiErrorBody = {
  error: string
}

export type XunfeiVoiceEntry = {
  id: string
  name: string
  language: 'en' | 'zh'
  gender: 'male' | 'female'
  tier: 'featured' | 'base'
  status: 'active' | 'expired'
  expiresAt?: string
}

export type PreferencesResponse = {
  tts_provider?: string
  available_providers?: string[]
  locale?: 'en' | 'zh'
  default_scenario_key?: string
  default_accent_key?: string
  tts_speed?: number
  tts_voice_id?: string | null
  ui_theme?: string
  xunfei_voices?: { configured?: XunfeiVoiceEntry[]; catalog?: XunfeiVoiceEntry[] }
}

export type UpdatePreferencesRequest = {
  tts_provider?: string
  locale?: 'en' | 'zh'
  default_scenario_key?: string
  default_accent_key?: string
  tts_speed?: number
  tts_voice_id?: string | null
  ui_theme?: string
}

export type UpdatePreferencesResponse = {
  tts_provider: string
  locale: 'en' | 'zh'
  default_scenario_key: string
  default_accent_key: string
  tts_speed: number
  tts_voice_id: string | null
  ui_theme: string
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

export type CreateSessionRequest = {
  scenario_id?: string
  accent_profile_id?: string
}

export type CreateSessionResponse = {
  id?: string
  status?: string
  started_at?: string
}

export type UpdateSessionStatusRequest = {
  id: string
  status: string
}

export type UpdateSessionStatusResponse = {
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
  id: string
  scenario: string
  scenario_key?: string | null
  accent: string
  accent_key?: string | null
  date: string
  status: string
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

export type ScenarioDto = Pick<Scenario, 'key' | 'name' | 'description' | 'labels' | 'descriptions' | 'difficulty' | 'icon'> & {
  label: string
  localized_description: string
}

export type ListScenariosResponse = {
  scenarios: ScenarioDto[]
}

export type AccentDto = Pick<AccentProfile, 'key' | 'name' | 'region' | 'description' | 'labels' | 'regions' | 'descriptions'> & {
  label: string
  localized_region: string
  localized_description: string
  supported_providers: string[]
  supported: boolean
  disabled_reason: string | null
}

export type ListAccentsResponse = {
  accents: AccentDto[]
  provider: string
  available_providers: string[]
}

export type SessionTurnCorrectionDto = {
  id: string
  type: string
  originalText: string
  suggestedText: string
  explanation: string
  severity: string
  audioUrl: string | null
  createdAt: string
}

export type SessionTurnDto = {
  id: string
  sessionId: string
  speaker: string
  transcript: string
  translatedText: string | null
  audioUrl: string | null
  createdAt: string
  corrections: SessionTurnCorrectionDto[]
}

export type ListSessionTurnsResponse = {
  session_id: string
  turns: SessionTurnDto[]
}
