import { describe, expect, it } from 'vitest'
import {
  canAcceptUserTranscript,
  canContinueListening,
  canEndSession,
  containsChineseText,
  acceptTranscriptTurn,
  advancePlaybackQueue,
  completeCoachPlayback,
  continueListening,
  createPlaybackQueueSnapshot,
  DEFAULT_SILENCE_FINALIZE_MS,
  endActiveSession,
  endsWithThinkingFiller,
  FILLER_GRACE_FINALIZE_MS,
  getSilenceFinalizeDelay,
  canSampleListeningLevel,
  canSamplePlaybackLevel,
  getNextSessionAction,
  getPlaybackCompletionEffects,
  pauseSessionForRoute,
  receiveCoachReply,
  recoverSessionError,
  requestCoachReply,
  shouldBlockUserInputDuringPlayback,
  shouldIgnoreNoSpeech,
  shouldPauseForRouteExit,
  shouldRestoreListeningAfterPlayback,
  shouldResumeListeningOnRoute,
  startListeningSession,
  startPlaybackQueue,
} from '@meteorvoice/session-core'
import { splitSpokenText } from '@meteorvoice/shared'

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

  it('centralizes mobile turn lifecycle transitions', () => {
    const listening = startListeningSession('mobile-session')
    expect(listening.state).toBe('listening')
    expect(listening.turnNumber).toBe(1)

    const accepted = acceptTranscriptTurn({
      snapshot: listening,
      transcript: 'Hello coach',
      messages: [],
    })
    expect(accepted.snapshot.state).toBe('transcribing')
    expect(accepted.messages).toEqual([{ role: 'user', content: 'Hello coach' }])

    const correcting = {
      ...accepted.snapshot,
      state: 'correcting' as const,
    }
    expect(continueListening(correcting).state).toBe('listening')
  })

  it('orchestrates coach reply request, receive, playback completion, pause, and end', () => {
    const listening = startListeningSession('session-core')
    const accepted = acceptTranscriptTurn({
      snapshot: listening,
      transcript: 'Hello coach',
      messages: [],
    })
    expect(accepted.effects).toEqual(['request_coach_reply'])

    const thinking = requestCoachReply(accepted.snapshot)
    expect(thinking.state).toBe('thinking')

    const received = receiveCoachReply({
      snapshot: thinking,
      messages: accepted.messages,
      responseText: 'Try: Hello, nice to meet you.',
      corrections: [{ type: 'grammar', originalText: 'hello', suggestedText: 'Hello', explanation: 'Capitalize the greeting.', severity: 'minor' }],
    })
    expect(received.snapshot.state).toBe('speaking')
    expect(received.messages).toHaveLength(2)
    expect(received.effects).toEqual(['play_coach_reply'])

    const completed = completeCoachPlayback({
      snapshot: received.snapshot,
      corrections: received.snapshot.lastCorrections,
    })
    expect(completed.snapshot.state).toBe('correcting')
    expect(completed.effects).toEqual(['show_corrections'])

    const paused = pauseSessionForRoute(continueListening(completed.snapshot))
    expect(paused.snapshot.state).toBe('idle')
    expect(paused.effects).toEqual(['pause_listening'])

    expect(completeCoachPlayback({
      snapshot: received.snapshot,
      corrections: [],
      shouldAutoRestoreListening: true,
    }).effects).toEqual(['restore_listening'])

    const ended = endActiveSession(completed.snapshot)
    expect(ended.snapshot.state).toBe('session_ended')
    expect(ended.effects).toEqual(['end_session'])
  })

  it('maps shared error recovery without platform-specific work', () => {
    const listening = startListeningSession('errors')
    const accepted = acceptTranscriptTurn({
      snapshot: listening,
      transcript: 'Hello',
      messages: [],
    })
    const thinking = requestCoachReply(accepted.snapshot)

    const recovered = recoverSessionError({
      snapshot: thinking,
      reason: 'coach_reply_failed',
      activeSession: true,
      canListenOnRoute: true,
    })
    expect(recovered.snapshot.state).toBe('idle')
    expect(recovered.effects).toEqual(['show_error', 'recover_to_idle', 'restore_listening'])
    expect(recovered.recoverable).toBe(true)

    const routePaused = recoverSessionError({
      snapshot: thinking,
      reason: 'stt_unavailable',
      activeSession: true,
      canListenOnRoute: false,
    })
    expect(routePaused.snapshot.state).toBe('idle')
    expect(routePaused.effects).toEqual(['show_error', 'recover_to_idle'])
    expect(routePaused.recoverable).toBe(false)

    const inactive = recoverSessionError({
      snapshot: thinking,
      reason: 'unknown',
      activeSession: false,
      canListenOnRoute: true,
    })
    expect(inactive.snapshot).toBe(thinking)
    expect(inactive.effects).toEqual(['show_error'])
  })

  it('advances playback queue without overlapping audio', () => {
    const initial = createPlaybackQueueSnapshot()
    expect(initial.status).toBe('idle')

    const queue = startPlaybackQueue('first.mp3', ['second.mp3'])
    expect(queue.status).toBe('playing')

    const next = advancePlaybackQueue({
      queue,
      finishedAudioUrl: 'first.mp3',
      didJustFinish: true,
      isPlaying: false,
    })
    expect(next.currentAudioUrl).toBe('second.mp3')
    expect(next.queuedAudioUrls).toEqual([])
    expect(next.status).toBe('playing')

    const finished = advancePlaybackQueue({
      queue: next,
      finishedAudioUrl: 'second.mp3',
      didJustFinish: true,
      isPlaying: false,
    })
    expect(finished.status).toBe('finished')
    expect(finished.currentAudioUrl).toBe('second.mp3')
    expect(getPlaybackCompletionEffects(next)).toEqual(['play_next_audio'])
    expect(getPlaybackCompletionEffects(finished)).toEqual(['show_corrections'])
  })

  it('splits spoken coach text into sentence-sized TTS segments', () => {
    expect(splitSpokenText('Hello! Try this: I would like a coffee. Then ask for the price.')).toEqual([
      'Hello! Try this: I would like a coffee.',
      'Then ask for the price.',
    ])
    expect(splitSpokenText('你好。Say it again? Great!', { maxCharsPerSegment: 8 })).toEqual(['你好。', 'Say it again?', 'Great!'])
    expect(splitSpokenText('First. Second. Third.', { maxCharsPerSegment: 7, maxSegments: 2 })).toEqual(['First.', 'Second. Third.'])
  })
})
