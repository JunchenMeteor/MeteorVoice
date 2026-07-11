/**
 * Runtime validation for public JSON API payloads.
 */
import type {
  ConversationContext,
  ConversationMessage,
  CorrectionItem,
} from '@meteorvoice/shared'

type ApiInputError = {
  error: string
  status: 400 | 413
}

type ApiInputResult<T> = { value: T } | ApiInputError

type TTSRequest = {
  text: string
  accent?: string
  speed?: number
  provider?: string
  voiceId?: string
}

type SessionSyncRequest = {
  session_id: string
  scenario: string
  accent: string
  turns: number
  messages: ConversationMessage[]
  corrections: CorrectionItem[]
}

type SummaryRequest = {
  sessionId: string
  scenario: string
  messages: ConversationMessage[]
  turnNumber: number
}

type TurnRequest = {
  session_id: string
  speaker: 'user' | 'assistant'
  transcript: string
  corrections?: CorrectionItem[]
}

const encoder = new TextEncoder()
const messageRoles = new Set<ConversationMessage['role']>(['user', 'assistant', 'system'])
const correctionTypes = new Set<CorrectionItem['type']>(['grammar', 'vocabulary', 'fluency', 'pronunciation'])
const correctionSeverities = new Set<CorrectionItem['severity']>(['minor', 'moderate', 'major'])

export async function readJsonRequest(request: Request, maxBytes: number): Promise<ApiInputResult<unknown>> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { error: 'Request body is too large', status: 413 }
  }

  const text = await request.text()
  if (encoder.encode(text).byteLength > maxBytes) {
    return { error: 'Request body is too large', status: 413 }
  }

  try {
    return { value: JSON.parse(text) as unknown }
  } catch {
    return { error: 'Invalid JSON body', status: 400 }
  }
}

export function parseChatRequest(input: unknown): ApiInputResult<{
  messages: ConversationMessage[]
  context: ConversationContext
}> {
  if (!isRecord(input)) return invalid('Invalid chat request')
  const messages = parseMessages(input.messages, { maxCount: 50, maxContentLength: 4000, allowEmpty: false })
  if (!messages) return invalid('Invalid chat messages')
  const context = parseConversationContext(input.context)
  if (!context) return invalid('Invalid chat context')
  return { value: { messages, context } }
}

export function parseTTSRequest(input: unknown): ApiInputResult<TTSRequest> {
  if (!isRecord(input) || typeof input.text !== 'string' || !input.text.trim()) return invalid('Text is required')
  if (input.text.length > 4000) return invalid('Text is too long')
  if (!isOptionalBoundedString(input.accent, 100) ||
      !isOptionalBoundedString(input.provider, 50) ||
      !isOptionalBoundedString(input.voiceId, 200) ||
      (input.speed !== undefined && (!isFiniteNumber(input.speed) || input.speed < 0.5 || input.speed > 2))) {
    return invalid('Invalid TTS options')
  }
  return {
    value: {
      text: input.text.trim(),
      accent: optionalString(input.accent),
      speed: input.speed as number | undefined,
      provider: optionalString(input.provider),
      voiceId: optionalString(input.voiceId),
    },
  }
}

export function parseSessionSyncRequest(input: unknown): ApiInputResult<SessionSyncRequest> {
  if (!isRecord(input) ||
      !isBoundedString(input.session_id, 1, 160) ||
      !isBoundedString(input.scenario, 1, 160) ||
      !isBoundedString(input.accent, 1, 160) ||
      !isIntegerInRange(input.turns, 0, 10_000)) {
    return invalid('Invalid session sync request')
  }
  const messages = parseMessages(input.messages, { maxCount: 200, maxContentLength: 4000, allowEmpty: true })
  if (!messages) return invalid('Invalid session messages')
  const corrections = parseCorrections(input.corrections, 200)
  if (!corrections) return invalid('Invalid corrections')
  return {
    value: {
      session_id: input.session_id.trim(),
      scenario: input.scenario.trim(),
      accent: input.accent.trim(),
      turns: input.turns,
      messages,
      corrections,
    },
  }
}

export function parseSummaryRequest(input: unknown): ApiInputResult<SummaryRequest> {
  if (!isRecord(input) ||
      !isBoundedString(input.sessionId, 1, 160) ||
      !isBoundedString(input.scenario, 1, 160) ||
      !isIntegerInRange(input.turnNumber, 0, 10_000)) {
    return invalid('Invalid summary request')
  }
  const messages = parseMessages(input.messages, { maxCount: 200, maxContentLength: 4000, allowEmpty: true })
  if (!messages) return invalid('Invalid summary messages')
  return {
    value: {
      sessionId: input.sessionId.trim(),
      scenario: input.scenario.trim(),
      messages,
      turnNumber: input.turnNumber,
    },
  }
}

export function parseTurnRequest(input: unknown): ApiInputResult<TurnRequest> {
  if (!isRecord(input) || !isBoundedString(input.session_id, 1, 160)) {
    return invalid('Invalid turn request')
  }
  if (input.speaker !== 'user' && input.speaker !== 'assistant') return invalid('Invalid speaker')
  if (!isBoundedString(input.transcript, 1, 4000)) return invalid('Invalid transcript')
  const corrections = input.corrections === undefined ? undefined : parseCorrections(input.corrections, 50)
  if (corrections === null) return invalid('Invalid corrections')
  return {
    value: {
      session_id: input.session_id.trim(),
      speaker: input.speaker,
      transcript: input.transcript.trim(),
      corrections,
    },
  }
}

function parseConversationContext(input: unknown): ConversationContext | null {
  if (!isRecord(input) || !isRecord(input.scenario) || !isRecord(input.accentProfile) ||
      !isBoundedString(input.scenario.name, 1, 160) ||
      !isBoundedString(input.scenario.description, 0, 500) ||
      !isBoundedString(input.accentProfile.name, 1, 160) ||
      !isBoundedString(input.accentProfile.region, 0, 160) ||
      !isBoundedString(input.sessionId, 1, 160) ||
      !isIntegerInRange(input.turnNumber, 0, 10_000) ||
      (input.responseLocale !== undefined && input.responseLocale !== 'en' && input.responseLocale !== 'zh')) {
    return null
  }
  return {
    scenario: { name: input.scenario.name.trim(), description: input.scenario.description.trim() },
    accentProfile: { name: input.accentProfile.name.trim(), region: input.accentProfile.region.trim() },
    sessionId: input.sessionId.trim(),
    turnNumber: input.turnNumber,
    responseLocale: input.responseLocale,
  }
}

function parseMessages(input: unknown, options: {
  maxCount: number
  maxContentLength: number
  allowEmpty: boolean
}): ConversationMessage[] | null {
  if (!Array.isArray(input) || input.length > options.maxCount || (!options.allowEmpty && input.length === 0)) return null
  const messages: ConversationMessage[] = []
  for (const message of input) {
    if (!isRecord(message) ||
        typeof message.role !== 'string' ||
        !messageRoles.has(message.role as ConversationMessage['role']) ||
        !isBoundedString(message.content, 1, options.maxContentLength)) {
      return null
    }
    messages.push({
      role: message.role as ConversationMessage['role'],
      content: message.content.trim(),
    })
  }
  return messages
}

function parseCorrections(input: unknown, maxCount: number): CorrectionItem[] | null {
  if (!Array.isArray(input) || input.length > maxCount) return null
  const corrections: CorrectionItem[] = []
  for (const correction of input) {
    if (!isRecord(correction) ||
        typeof correction.type !== 'string' ||
        !correctionTypes.has(correction.type as CorrectionItem['type']) ||
        typeof correction.severity !== 'string' ||
        !correctionSeverities.has(correction.severity as CorrectionItem['severity']) ||
        !isBoundedString(correction.originalText, 1, 1000) ||
        !isBoundedString(correction.suggestedText, 1, 1000) ||
        !isBoundedString(correction.explanation, 1, 2000)) {
      return null
    }
    corrections.push({
      type: correction.type as CorrectionItem['type'],
      originalText: correction.originalText.trim(),
      suggestedText: correction.suggestedText.trim(),
      explanation: correction.explanation.trim(),
      severity: correction.severity as CorrectionItem['severity'],
    })
  }
  return corrections
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isBoundedString(value: unknown, minLength: number, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length >= minLength && value.length <= maxLength
}

function isOptionalBoundedString(value: unknown, maxLength: number) {
  return value === undefined || (typeof value === 'string' && value.length <= maxLength)
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= minimum && value <= maximum
}

function invalid(error: string): ApiInputError {
  return { error, status: 400 }
}
