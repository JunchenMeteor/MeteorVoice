import type { WorkflowState } from './workflow'

export type TurnGuardState = {
  activeSession: boolean
  activeTurnId: number
  currentTurnId: number
  canListenOnRoute: boolean
  workflowState: WorkflowState
}

export function isCurrentTurn(state: TurnGuardState) {
  return state.activeSession && state.activeTurnId === state.currentTurnId
}

export function canContinueListening(state: TurnGuardState) {
  return isCurrentTurn(state) && state.canListenOnRoute
}

export function canSampleListeningLevel(state: TurnGuardState) {
  return canContinueListening(state) && state.workflowState === 'listening'
}

export function canSamplePlaybackLevel(state: TurnGuardState) {
  return state.activeSession && state.canListenOnRoute && state.workflowState === 'speaking'
}

export function shouldResumeListeningOnRoute(input: {
  activeSession: boolean
  workflowState: WorkflowState
}) {
  return input.activeSession && (input.workflowState === 'idle' || input.workflowState === 'correcting')
}

export function shouldPauseForRouteExit(input: {
  activeSession: boolean
  workflowState: WorkflowState
}) {
  return input.activeSession && input.workflowState === 'listening'
}

export function shouldBlockUserInputDuringPlayback(input: {
  activeSession: boolean
  workflowState: WorkflowState
}) {
  return input.activeSession && input.workflowState === 'speaking'
}

export function canEndSession(input: {
  activeSession: boolean
  workflowState: WorkflowState
}) {
  return input.activeSession && input.workflowState !== 'session_ended'
}
