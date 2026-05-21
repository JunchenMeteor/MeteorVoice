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
