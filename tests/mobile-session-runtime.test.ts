import { describe, expect, it } from 'vitest'
import {
  canStartListening,
  getPlaybackTailPrewarmDecision,
  routePresenceForTab,
  shouldConfirmScenarioSwitch,
  shouldResumeListening,
} from '../apps/mobile/src/sessionRuntime'
import {
  canApplyEndpointResult,
  classifyRequestTerminalStage,
  isTurnStale,
} from '../apps/mobile/src/sessionTurnRuntime'

describe('mobile session runtime selectors', () => {
  it('maps route presence from tab state', () => {
    expect(routePresenceForTab('session')).toBe('inSession')
    expect(routePresenceForTab('home')).toBe('outSession')
    expect(routePresenceForTab('settings')).toBe('outSession')
  })

  it('allows listening only when session, route, generation, and activity gates are clear', () => {
    expect(canStartListening({
      sessionActive: true,
      routePresence: 'inSession',
      canListenOnRoute: true,
      busy: false,
      playbackActive: false,
      audioPlaying: false,
      generation: 2,
      currentGeneration: 2,
    })).toBe(true)

    expect(canStartListening({
      sessionActive: true,
      routePresence: 'inSession',
      canListenOnRoute: true,
      busy: false,
      playbackActive: false,
      audioPlaying: false,
      generation: 1,
      currentGeneration: 2,
    })).toBe(false)
  })

  it('prewarms only near the tail of long Xunfei playback', () => {
    expect(getPlaybackTailPrewarmDecision({
      provider: 'xunfei',
      isPlaying: true,
      playbackActive: true,
      audioUrl: 'https://audio.example/reply.mp3',
      prewarmedAudioUrl: null,
      playbackDurationSeconds: 5,
      playbackRemainingMs: 850,
    }).shouldPrewarm).toBe(true)

    expect(getPlaybackTailPrewarmDecision({
      provider: 'xunfei',
      isPlaying: true,
      playbackActive: true,
      audioUrl: 'https://audio.example/short.mp3',
      prewarmedAudioUrl: null,
      playbackDurationSeconds: 1,
      playbackRemainingMs: 500,
    }).shouldPrewarm).toBe(false)
  })

  it('keeps scenario confirmation limited to active different-scenario replacement', () => {
    expect(shouldConfirmScenarioSwitch({
      currentScenarioKey: 'small-talk',
      nextScenarioKey: 'small-talk',
      sessionActive: true,
    })).toBe(false)

    expect(shouldConfirmScenarioSwitch({
      currentScenarioKey: 'small-talk',
      nextScenarioKey: 'interview',
      sessionActive: true,
    })).toBe(true)
  })

  it('classifies stale turn and endpoint guards', () => {
    expect(isTurnStale({
      turnRequestId: 2,
      currentTurnRequestId: 3,
      generation: 4,
      currentGeneration: 4,
      sessionActive: true,
    })).toBe(true)

    expect(canApplyEndpointResult({
      endpointRequestId: 5,
      currentEndpointRequestId: 5,
      sessionActive: true,
      canListenOnRoute: true,
      playbackActive: false,
    })).toBe(true)
  })

  it('classifies timeout terminal stage', () => {
    expect(classifyRequestTerminalStage(new Error('Coach reply request timed out.')).stage)
      .toBe('submit_turn_timeout')
  })

  it('describes playback resume gate', () => {
    expect(shouldResumeListening({
      sessionActive: true,
      routePresence: 'inSession',
      canListenOnRoute: true,
      busy: false,
      playbackActive: false,
      audioPlaying: false,
      generation: 3,
      currentGeneration: 3,
    })).toBe(true)

    expect(shouldResumeListening({
      sessionActive: true,
      routePresence: 'outSession',
      canListenOnRoute: true,
      busy: false,
      playbackActive: false,
      audioPlaying: false,
      generation: 3,
      currentGeneration: 3,
    })).toBe(false)

    expect(shouldResumeListening({
      sessionActive: true,
      routePresence: 'inSession',
      canListenOnRoute: true,
      busy: true,
      playbackActive: false,
      audioPlaying: false,
      generation: 3,
      currentGeneration: 3,
    })).toBe(false)

    expect(shouldResumeListening({
      sessionActive: true,
      routePresence: 'inSession',
      canListenOnRoute: true,
      busy: false,
      playbackActive: false,
      audioPlaying: false,
      generation: 2,
      currentGeneration: 3,
    })).toBe(false)
  })
})
