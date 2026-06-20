/**
 * Turn guard — 6-layer gate for user transcript validation.
 * 轮次守卫 — 6 层用户语音校验。
 */
import type { WorkflowState } from './workflow'

export type TurnGuardState = {
  activeSession: boolean
  activeTurnId: number
  currentTurnId: number
  canListenOnRoute: boolean
  workflowState: WorkflowState
}

/**
 * Checks if the current turn is the active turn in the session.
 * 检查当前轮次是否为会话中的活动轮次。
 */
export function isCurrentTurn(state: TurnGuardState) {
  return state.activeSession && state.activeTurnId === state.currentTurnId
}

/**
 * Checks if the turn guard allows continued listening (active session, current turn, and listen route).
 * 检查轮次守卫是否允许继续监听（活动会话、当前轮次且路由允许监听）。
 */
export function canContinueListening(state: TurnGuardState) {
  return isCurrentTurn(state) && state.canListenOnRoute
}

/**
 * Checks if the audio level should be sampled during listening (continued listening + listening workflow state).
 * 检查在监听期间是否应采集音频电平（继续监听且工作流状态为 listening）。
 */
export function canSampleListeningLevel(state: TurnGuardState) {
  return canContinueListening(state) && state.workflowState === 'listening'
}

/**
 * Checks if the audio level should be sampled during TTS playback (active session, listen route, speaking state).
 * 检查在 TTS 播放期间是否应采集音频电平（活动会话、路由允许监听且工作流状态为 speaking）。
 */
export function canSamplePlaybackLevel(state: TurnGuardState) {
  return state.activeSession && state.canListenOnRoute && state.workflowState === 'speaking'
}

/**
 * Determines if listening should resume when entering a route (active session in idle or correcting state).
 * 判断进入路由时是否应恢复监听（活动会话且工作流状态为 idle 或 correcting）。
 */
export function shouldResumeListeningOnRoute(input: {
  activeSession: boolean
  workflowState: WorkflowState
}) {
  return input.activeSession && (input.workflowState === 'idle' || input.workflowState === 'correcting')
}

/**
 * Determines if listening should pause when exiting a route (active session in listening state).
 * 判断离开路由时是否应暂停监听（活动会话且工作流状态为 listening）。
 */
export function shouldPauseForRouteExit(input: {
  activeSession: boolean
  workflowState: WorkflowState
}) {
  return input.activeSession && input.workflowState === 'listening'
}

/**
 * Determines if user input should be blocked during audio playback (active session in speaking state).
 * 判断音频播放期间是否应阻止用户输入（活动会话且工作流状态为 speaking）。
 */
export function shouldBlockUserInputDuringPlayback(input: {
  activeSession: boolean
  workflowState: WorkflowState
}) {
  return input.activeSession && input.workflowState === 'speaking'
}

/**
 * Checks whether the session can be ended (active session not already in session_ended state).
 * 检查是否可以结束会话（活动会话且工作流状态不是 session_ended）。
 */
export function canEndSession(input: {
  activeSession: boolean
  workflowState: WorkflowState
}) {
  return input.activeSession && input.workflowState !== 'session_ended'
}
