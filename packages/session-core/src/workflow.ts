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

export interface PlaybackQueueSnapshot {
  currentAudioUrl: string | null
  queuedAudioUrls: string[]
  lastFinishedAudioUrl: string | null
  status: 'idle' | 'playing' | 'finished'
}

export type SessionEffect =
  | 'request_coach_reply'
  | 'play_coach_reply'
  | 'play_next_audio'
  | 'show_corrections'
  | 'show_error'
  | 'recover_to_idle'
  | 'restore_listening'
  | 'pause_listening'
  | 'end_session'

export type SessionErrorReason =
  | 'no_speech'
  | 'stt_unavailable'
  | 'coach_reply_failed'
  | 'tts_failed'
  | 'playback_blocked'
  | 'unknown'

export interface SessionOrchestrationResult {
  snapshot: WorkflowSnapshot
  messages: ConversationMessage[]
  effects: SessionEffect[]
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

export function startListeningSession(sessionId: string): WorkflowSnapshot {
  return transition(createInitialSnapshot(sessionId), 'listening')
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

export function acceptTranscriptTurn(input: {
  snapshot: WorkflowSnapshot
  transcript: string
  messages: ConversationMessage[]
}): SessionOrchestrationResult & { userMessage: ConversationMessage } {
  const userMessage: ConversationMessage = { role: 'user', content: input.transcript }
  const messages = [...input.messages, userMessage]
  let nextSnapshot = transition(input.snapshot, input.snapshot.state === 'listening' ? 'transcribing' : 'listening', {
    lastTranscript: input.transcript,
    messages,
  })

  if (nextSnapshot.state === 'listening') {
    nextSnapshot = transition(nextSnapshot, 'transcribing', {
      lastTranscript: input.transcript,
      messages,
    })
  }

  return { snapshot: nextSnapshot, messages, userMessage, effects: ['request_coach_reply'] }
}

export function requestCoachReply(snapshot: WorkflowSnapshot): WorkflowSnapshot {
  return transition(snapshot, 'thinking')
}

export function receiveCoachReply(input: {
  snapshot: WorkflowSnapshot
  messages: ConversationMessage[]
  responseText: string
  corrections: ConversationResponse['corrections']
}): SessionOrchestrationResult {
  const assistantMessage: ConversationMessage = { role: 'assistant', content: input.responseText }
  const messages = [...input.messages, assistantMessage]
  const snapshot = transition(input.snapshot, 'speaking', {
    lastResponse: input.responseText,
    lastCorrections: input.corrections,
    messages,
  })

  return { snapshot, messages, effects: ['play_coach_reply'] }
}

export function completeCoachPlayback(input: {
  snapshot: WorkflowSnapshot
  corrections: ConversationResponse['corrections']
  shouldAutoRestoreListening?: boolean
}): SessionOrchestrationResult {
  if (input.corrections.length > 0) {
    return {
      snapshot: transition(input.snapshot, 'correcting', { lastCorrections: input.corrections }),
      messages: input.snapshot.messages,
      effects: ['show_corrections'],
    }
  }

  if (input.shouldAutoRestoreListening) {
    return {
      snapshot: transition(input.snapshot, 'listening'),
      messages: input.snapshot.messages,
      effects: ['restore_listening'],
    }
  }

  return {
    snapshot: transition(input.snapshot, 'correcting', { lastCorrections: [] }),
    messages: input.snapshot.messages,
    effects: ['show_corrections'],
  }
}

export function recoverSessionError(input: {
  snapshot: WorkflowSnapshot
  reason: SessionErrorReason
  activeSession: boolean
  canListenOnRoute: boolean
}): {
  snapshot: WorkflowSnapshot
  effects: SessionEffect[]
  reason: SessionErrorReason
  recoverable: boolean
} {
  if (!input.activeSession || input.snapshot.state === 'session_ended') {
    return {
      snapshot: input.snapshot,
      effects: ['show_error'],
      reason: input.reason,
      recoverable: false,
    }
  }

  const shouldMoveToIdle =
    input.snapshot.state === 'listening' ||
    input.snapshot.state === 'transcribing' ||
    input.snapshot.state === 'thinking' ||
    input.snapshot.state === 'speaking'

  const snapshot = shouldMoveToIdle
    ? transition(input.snapshot, 'idle')
    : input.snapshot

  const effects: SessionEffect[] = ['show_error']
  if (shouldMoveToIdle) effects.push('recover_to_idle')
  if (input.canListenOnRoute && (snapshot.state === 'idle' || snapshot.state === 'correcting')) {
    effects.push('restore_listening')
  }

  return {
    snapshot,
    effects,
    reason: input.reason,
    recoverable: input.canListenOnRoute,
  }
}

export function continueListening(snapshot: WorkflowSnapshot): WorkflowSnapshot {
  if (snapshot.state === 'correcting' || snapshot.state === 'idle') {
    return transition(snapshot, 'listening')
  }

  return snapshot
}

export function snapshotSummary(snapshot: WorkflowSnapshot) {
  return {
    state: snapshot.state,
    turnNumber: snapshot.turnNumber,
    messageCount: snapshot.messages.length,
    hasPendingCorrections: snapshot.lastCorrections.length > 0,
  }
}

export function createPlaybackQueueSnapshot(): PlaybackQueueSnapshot {
  return {
    currentAudioUrl: null,
    queuedAudioUrls: [],
    lastFinishedAudioUrl: null,
    status: 'idle',
  }
}

export function startPlaybackQueue(firstAudioUrl: string | null, queuedAudioUrls: string[] = []): PlaybackQueueSnapshot {
  return {
    currentAudioUrl: firstAudioUrl,
    queuedAudioUrls,
    lastFinishedAudioUrl: null,
    status: firstAudioUrl ? 'playing' : 'idle',
  }
}

export function enqueuePlaybackAudio(
  queue: PlaybackQueueSnapshot,
  audioUrls: string[],
): PlaybackQueueSnapshot {
  return {
    ...queue,
    queuedAudioUrls: [...queue.queuedAudioUrls, ...audioUrls.filter(Boolean)],
  }
}

export function advancePlaybackQueue(input: {
  queue: PlaybackQueueSnapshot
  finishedAudioUrl: string | null
  didJustFinish: boolean
  isPlaying: boolean
}): PlaybackQueueSnapshot {
  const { queue, finishedAudioUrl } = input
  if (!finishedAudioUrl || !input.didJustFinish || input.isPlaying) return queue
  if (queue.lastFinishedAudioUrl === finishedAudioUrl && queue.queuedAudioUrls.length === 0) return queue

  const [nextAudioUrl, ...remainingAudioUrls] = queue.queuedAudioUrls

  return {
    currentAudioUrl: nextAudioUrl ?? queue.currentAudioUrl,
    queuedAudioUrls: remainingAudioUrls,
    lastFinishedAudioUrl: finishedAudioUrl,
    status: nextAudioUrl ? 'playing' : 'finished',
  }
}

export function getPlaybackCompletionEffects(queue: PlaybackQueueSnapshot): SessionEffect[] {
  if (queue.status === 'playing') return ['play_next_audio']
  if (queue.status === 'finished') return ['show_corrections']
  return []
}

export function pauseSessionForRoute(snapshot: WorkflowSnapshot): {
  snapshot: WorkflowSnapshot
  effects: SessionEffect[]
} {
  if (snapshot.state === 'listening') {
    return { snapshot: transition(snapshot, 'idle'), effects: ['pause_listening'] }
  }

  return { snapshot, effects: ['pause_listening'] }
}

export function endActiveSession(snapshot: WorkflowSnapshot): {
  snapshot: WorkflowSnapshot
  effects: SessionEffect[]
} {
  return { snapshot: transition(snapshot, 'session_ended'), effects: ['end_session'] }
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
