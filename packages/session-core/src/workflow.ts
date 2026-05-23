import type { ConversationMessage, ConversationResponse } from '@meteorvoice/shared'

export type WorkflowState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'correcting'
  | 'session_ended'

export interface WorkflowSnapshot {
  state: WorkflowState
  sessionId: string
  messages: ConversationMessage[]
  turnNumber: number
  lastCorrections: ConversationResponse['corrections']
  lastTranscript: string
  lastResponse: string
  error: string | null
}

export const VALID_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  idle: ['listening', 'session_ended'],
  listening: ['transcribing', 'idle', 'session_ended'],
  transcribing: ['thinking', 'idle', 'session_ended'],
  thinking: ['speaking', 'idle', 'session_ended'],
  speaking: ['correcting', 'listening', 'idle', 'session_ended'],
  correcting: ['listening', 'session_ended'],
  session_ended: [],
}

export function createInitialSnapshot(sessionId: string): WorkflowSnapshot {
  return {
    state: 'idle',
    sessionId,
    messages: [],
    turnNumber: 0,
    lastCorrections: [],
    lastTranscript: '',
    lastResponse: '',
    error: null,
  }
}

export function transition(
  from: WorkflowSnapshot,
  to: WorkflowState,
  patch: Partial<WorkflowSnapshot> = {},
): WorkflowSnapshot {
  const allowed = VALID_TRANSITIONS[from.state]
  if (!allowed.includes(to)) {
    return { ...from, error: `Invalid transition: ${from.state} -> ${to}` }
  }
  return {
    ...from,
    ...patch,
    state: to,
    error: null,
    turnNumber: to === 'listening' ? from.turnNumber + 1 : from.turnNumber,
  }
}

export function snapshotSummary(snapshot: WorkflowSnapshot) {
  return {
    state: snapshot.state,
    turnNumber: snapshot.turnNumber,
    messageCount: snapshot.messages.length,
    hasPendingCorrections: snapshot.lastCorrections.length > 0,
  }
}

export type SessionNextAction =
  | 'wait_for_start'
  | 'listen'
  | 'transcribe'
  | 'request_reply'
  | 'play_reply'
  | 'show_corrections'
  | 'ended'
  | 'blocked'

export function getNextSessionAction(input: {
  activeSession: boolean
  canListenOnRoute: boolean
  workflowState: WorkflowState
}): SessionNextAction {
  if (input.workflowState === 'session_ended') return 'ended'
  if (!input.activeSession) return 'wait_for_start'
  if (!input.canListenOnRoute && input.workflowState === 'listening') return 'blocked'

  switch (input.workflowState) {
    case 'idle':
      return input.canListenOnRoute ? 'listen' : 'blocked'
    case 'correcting':
      return 'show_corrections'
    case 'listening':
      return 'transcribe'
    case 'transcribing':
      return 'request_reply'
    case 'thinking':
      return 'request_reply'
    case 'speaking':
      return 'play_reply'
    default:
      return 'blocked'
  }
}

export function canAcceptUserTranscript(input: {
  activeSession: boolean
  canListenOnRoute: boolean
  workflowState: WorkflowState
  transcript?: string | null
}) {
  return Boolean(
    input.activeSession &&
    input.canListenOnRoute &&
    input.transcript?.trim() &&
    (input.workflowState === 'listening' || input.workflowState === 'idle' || input.workflowState === 'correcting'),
  )
}

export function shouldIgnoreNoSpeech(input: {
  activeSession: boolean
  workflowState: WorkflowState
  transcript?: string | null
}) {
  return input.activeSession && input.workflowState === 'listening' && !input.transcript?.trim()
}

export function shouldRestoreListeningAfterPlayback(input: {
  activeSession: boolean
  canListenOnRoute: boolean
  workflowState: WorkflowState
}) {
  return input.activeSession && input.canListenOnRoute && input.workflowState === 'speaking'
}

export const DEFAULT_SILENCE_FINALIZE_MS = 1400
export const FILLER_GRACE_FINALIZE_MS = 2200

const FILLER_END_PATTERN = /(?:^|[\s,，.。!?！？])(?:um+|uh+|er+|erm+|hmm+|mmm+|嗯+|啊+|呃+|额+|唔+)[\s,，.。!?！？]*$/i
const CHINESE_TEXT_PATTERN = /[\u3400-\u9fff]/

export function endsWithThinkingFiller(transcript?: string | null) {
  return FILLER_END_PATTERN.test(transcript?.trim() ?? '')
}

export function containsChineseText(transcript?: string | null) {
  return CHINESE_TEXT_PATTERN.test(transcript ?? '')
}

export function getSilenceFinalizeDelay(transcript?: string | null) {
  return endsWithThinkingFiller(transcript)
    ? FILLER_GRACE_FINALIZE_MS
    : DEFAULT_SILENCE_FINALIZE_MS
}
