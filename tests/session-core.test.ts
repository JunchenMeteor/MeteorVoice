import { describe, expect, it } from 'vitest'
import {
  canAcceptUserTranscript,
  canContinueListening,
  canEndSession,
  containsChineseText,
  DEFAULT_SILENCE_FINALIZE_MS,
  endsWithThinkingFiller,
  FILLER_GRACE_FINALIZE_MS,
  getSilenceFinalizeDelay,
  canSampleListeningLevel,
  canSamplePlaybackLevel,
  getNextSessionAction,
  shouldBlockUserInputDuringPlayback,
  shouldIgnoreNoSpeech,
  shouldPauseForRouteExit,
  shouldRestoreListeningAfterPlayback,
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

  it('describes next session actions from workflow state', () => {
    expect(getNextSessionAction({ activeSession: false, canListenOnRoute: true, workflowState: 'idle' })).toBe('wait_for_start')
    expect(getNextSessionAction({ activeSession: true, canListenOnRoute: true, workflowState: 'idle' })).toBe('listen')
    expect(getNextSessionAction({ activeSession: true, canListenOnRoute: true, workflowState: 'listening' })).toBe('transcribe')
    expect(getNextSessionAction({ activeSession: true, canListenOnRoute: true, workflowState: 'thinking' })).toBe('request_reply')
    expect(getNextSessionAction({ activeSession: true, canListenOnRoute: true, workflowState: 'speaking' })).toBe('play_reply')
    expect(getNextSessionAction({ activeSession: true, canListenOnRoute: true, workflowState: 'correcting' })).toBe('show_corrections')
    expect(getNextSessionAction({ activeSession: true, canListenOnRoute: true, workflowState: 'session_ended' })).toBe('ended')
  })

  it('accepts real transcripts only in input-ready states', () => {
    expect(canAcceptUserTranscript({
      activeSession: true,
      canListenOnRoute: true,
      workflowState: 'listening',
      transcript: 'hello',
    })).toBe(true)

    expect(canAcceptUserTranscript({
      activeSession: true,
      canListenOnRoute: true,
      workflowState: 'speaking',
      transcript: 'hello',
    })).toBe(false)

    expect(shouldIgnoreNoSpeech({
      activeSession: true,
      workflowState: 'listening',
      transcript: '   ',
    })).toBe(true)
  })

  it('blocks user input during playback and restores listening after playback', () => {
    expect(shouldBlockUserInputDuringPlayback({ activeSession: true, workflowState: 'speaking' })).toBe(true)
    expect(shouldRestoreListeningAfterPlayback({
      activeSession: true,
      canListenOnRoute: true,
      workflowState: 'speaking',
    })).toBe(true)
    expect(canEndSession({ activeSession: true, workflowState: 'speaking' })).toBe(true)
    expect(canEndSession({ activeSession: true, workflowState: 'session_ended' })).toBe(false)
  })

  it('uses short silence finalization with filler grace', () => {
    expect(getSilenceFinalizeDelay('I would like to book a table')).toBe(DEFAULT_SILENCE_FINALIZE_MS)
    expect(getSilenceFinalizeDelay('I would like to, um')).toBe(FILLER_GRACE_FINALIZE_MS)
    expect(getSilenceFinalizeDelay('我想 um')).toBe(FILLER_GRACE_FINALIZE_MS)
    expect(getSilenceFinalizeDelay('我想 嗯')).toBe(FILLER_GRACE_FINALIZE_MS)
    expect(endsWithThinkingFiller('I think uh')).toBe(true)
    expect(endsWithThinkingFiller('I think this is useful')).toBe(false)
  })

  it('detects Chinese words inside mixed English input', () => {
    expect(containsChineseText('I want to 预约 a table')).toBe(true)
    expect(containsChineseText('I want to reserve a table')).toBe(false)
  })
})
