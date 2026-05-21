import { describe, expect, it } from 'vitest'
import {
  canContinueListening,
  canSampleListeningLevel,
  canSamplePlaybackLevel,
  shouldPauseForRouteExit,
  shouldResumeListeningOnRoute,
} from '@meteorvoice/session-core'

describe('session-core turn guard helpers', () => {
  it('allows a current active turn to continue listening on route', () => {
    expect(canContinueListening({
      activeSession: true,
      activeTurnId: 3,
      currentTurnId: 3,
      canListenOnRoute: true,
      workflowState: 'listening',
    })).toBe(true)
  })

  it('blocks stale turns and route-paused turns', () => {
    expect(canContinueListening({
      activeSession: true,
      activeTurnId: 4,
      currentTurnId: 3,
      canListenOnRoute: true,
      workflowState: 'listening',
    })).toBe(false)

    expect(canContinueListening({
      activeSession: true,
      activeTurnId: 3,
      currentTurnId: 3,
      canListenOnRoute: false,
      workflowState: 'listening',
    })).toBe(false)
  })

  it('only samples microphone level during active listening', () => {
    expect(canSampleListeningLevel({
      activeSession: true,
      activeTurnId: 1,
      currentTurnId: 1,
      canListenOnRoute: true,
      workflowState: 'listening',
    })).toBe(true)

    expect(canSampleListeningLevel({
      activeSession: true,
      activeTurnId: 1,
      currentTurnId: 1,
      canListenOnRoute: true,
      workflowState: 'speaking',
    })).toBe(false)
  })

  it('only samples playback level during speaking', () => {
    expect(canSamplePlaybackLevel({
      activeSession: true,
      activeTurnId: 2,
      currentTurnId: 2,
      canListenOnRoute: true,
      workflowState: 'speaking',
    })).toBe(true)

    expect(canSamplePlaybackLevel({
      activeSession: true,
      activeTurnId: 2,
      currentTurnId: 2,
      canListenOnRoute: true,
      workflowState: 'listening',
    })).toBe(false)
  })

  it('describes route pause and resume decisions', () => {
    expect(shouldPauseForRouteExit({ activeSession: true, workflowState: 'listening' })).toBe(true)
    expect(shouldPauseForRouteExit({ activeSession: true, workflowState: 'speaking' })).toBe(false)
    expect(shouldResumeListeningOnRoute({ activeSession: true, workflowState: 'idle' })).toBe(true)
    expect(shouldResumeListeningOnRoute({ activeSession: true, workflowState: 'correcting' })).toBe(true)
    expect(shouldResumeListeningOnRoute({ activeSession: true, workflowState: 'speaking' })).toBe(false)
  })
})
