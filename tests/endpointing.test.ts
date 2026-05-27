import { describe, expect, it } from 'vitest'
import {
  isTurnDefinitelyComplete,
  judgeEndpoint,
  judgeTurnLocally,
  type JudgeEndpointInput,
  type VoiceActivitySnapshot,
} from '@meteorvoice/session-core'

function baseInput(overrides: Partial<JudgeEndpointInput> = {}): JudgeEndpointInput {
  return {
    transcript: '',
    listeningDurationMs: 0,
    messages: [],
    scenario: 'small-talk',
    ...overrides,
  }
}

function voiceActivity(overrides: Partial<VoiceActivitySnapshot> = {}): VoiceActivitySnapshot {
  return {
    isVoiceActive: false,
    lastVoiceAt: null,
    level: null,
    noiseFloor: 0.018,
    peakLevel: 0,
    smoothedPeakLevel: 0,
    threshold: 0.085,
    ...overrides,
  }
}

describe('L1 fast path: isTurnDefinitelyComplete', () => {
  it('submits obvious short answers and greetings', () => {
    expect(isTurnDefinitelyComplete('Yes')).toBe(true)
    expect(isTurnDefinitelyComplete('No')).toBe(true)
    expect(isTurnDefinitelyComplete('I see')).toBe(true)
    expect(isTurnDefinitelyComplete('Got it')).toBe(true)
    expect(isTurnDefinitelyComplete('OK')).toBe(true)
    expect(isTurnDefinitelyComplete('Hello')).toBe(true)
    expect(isTurnDefinitelyComplete('Hi')).toBe(true)
    expect(isTurnDefinitelyComplete('Hey')).toBe(true)
    expect(isTurnDefinitelyComplete('Good morning')).toBe(true)
    expect(isTurnDefinitelyComplete('Not much')).toBe(true)
    expect(isTurnDefinitelyComplete("I'm fine")).toBe(true)
    expect(isTurnDefinitelyComplete('Please repeat')).toBe(true)
    expect(isTurnDefinitelyComplete('One more time')).toBe(true)
    expect(isTurnDefinitelyComplete("I don't understand")).toBe(true)
    expect(isTurnDefinitelyComplete('Not sure')).toBe(true)
    expect(isTurnDefinitelyComplete('Try again')).toBe(true)
  })

  it('submits complete punctuated sentences', () => {
    expect(isTurnDefinitelyComplete('The weather is nice today.')).toBe(true)
    expect(isTurnDefinitelyComplete('What time is it?')).toBe(true)
  })

  it('does not submit arbitrary unpunctuated phrases by default', () => {
    expect(isTurnDefinitelyComplete('I want to go')).toBe(false)
  })

  it('leaves structurally incomplete text to the incomplete guard', () => {
    expect(isTurnDefinitelyComplete('I want to')).toBe(false)
    expect(isTurnDefinitelyComplete('I went there and')).toBe(false)
    expect(isTurnDefinitelyComplete('I think that um')).toBe(false)
    expect(isTurnDefinitelyComplete('I saw a')).toBe(false)
  })
})

describe('judgeTurnLocally', () => {
  it('returns complete for high-confidence completed turns', () => {
    expect(judgeTurnLocally('Yes')).toBe('complete')
    expect(judgeTurnLocally('The weather is nice today.')).toBe('complete')
  })

  it('returns uncertain for everything that should go to L2', () => {
    expect(judgeTurnLocally('I want to')).toBe('uncertain')
    expect(judgeTurnLocally('I went there and')).toBe('uncertain')
    expect(judgeTurnLocally('I think that um')).toBe('uncertain')
    expect(judgeTurnLocally('I want to go')).toBe('uncertain')
  })
})

describe('judgeEndpoint', () => {
  it('submits immediately when L1 is confident complete', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'The weather is really nice today.',
      listeningDurationMs: 1000,
    }))
    expect(result.judgment).toBe('submit')
    expect(result.reason).toBe('confident_complete')
  })

  it('submits short answers immediately', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'Yes',
      listeningDurationMs: 500,
    }))
    expect(result.judgment).toBe('submit')
    expect(result.reason).toBe('confident_complete')
  })

  it('submits short greeting phrases when no semantic check exists', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'Good morning',
      listeningDurationMs: 500,
      lastVoiceAtMs: Date.now() - 1000,
    }))
    expect(result.judgment).toBe('submit')
    expect(result.reason).toBe('confident_complete')
  })

  it('uses L2 for structurally incomplete-looking endings', async () => {
    const calls: string[] = []
    const result = await judgeEndpoint(baseInput({
      transcript: 'I want to',
      listeningDurationMs: 1200,
      lastVoiceAtMs: Date.now() - 1000,
      semanticCheck: async (transcript) => {
        calls.push(transcript)
        return 'thinking'
      },
    }))
    expect(calls).toEqual(['I want to'])
    expect(result.judgment).toBe('continue')
    expect(result.reason).toBe('llm_thinking')
  })

  it('continues when voice is still active', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'I think it is important',
      listeningDurationMs: 3000,
      voiceActivity: voiceActivity({ isVoiceActive: true, lastVoiceAt: Date.now(), level: 0.5 }),
      semanticCheck: async () => 'done',
    }))
    expect(result.judgment).toBe('continue')
  })

  it('continues when no transcript exists yet', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: '',
      listeningDurationMs: 8000,
    }))
    expect(result.judgment).toBe('continue')
    expect(result.reason).toBe('no_transcript_yet')
  })

  it('submits on max listening timeout', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'I was thinking that maybe we could',
      listeningDurationMs: 46000,
    }))
    expect(result.judgment).toBe('submit')
    expect(result.reason).toBe('max_listening_timeout')
  })

  it('submits on max silence timeout', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'I have something to say',
      listeningDurationMs: 5000,
      lastVoiceAtMs: Date.now() - 10000,
    }))
    expect(result.judgment).toBe('submit')
    expect(result.reason).toBe('max_silence_timeout')
  })

  it('calls L2 for uncertain transcript after pause', async () => {
    const calls: string[] = []
    const result = await judgeEndpoint(baseInput({
      transcript: 'I think the most important thing is that we should',
      listeningDurationMs: 3000,
      voiceActivity: voiceActivity({ lastVoiceAt: Date.now() - 1000 }),
      lastVoiceAtMs: Date.now() - 1000,
      semanticCheck: async (transcript) => {
        calls.push(transcript)
        return 'thinking'
      },
    }))
    expect(calls).toEqual(['I think the most important thing is that we should'])
    expect(result.judgment).toBe('continue')
    expect(result.reason).toBe('llm_thinking')
  })

  it('calls L2 even when this is the first turn without history', async () => {
    const calls: string[] = []
    const result = await judgeEndpoint(baseInput({
      transcript: 'I think the best part is',
      listeningDurationMs: 3000,
      voiceActivity: voiceActivity({ lastVoiceAt: Date.now() - 2000 }),
      lastVoiceAtMs: Date.now() - 2000,
      messages: [],
      semanticCheck: async (transcript) => {
        calls.push(transcript)
        return 'thinking'
      },
    }))
    expect(calls).toEqual(['I think the best part is'])
    expect(result.judgment).toBe('continue')
    expect(result.reason).toBe('llm_thinking')
  })

  it('submits when L2 returns done', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'I think AI will change the world',
      listeningDurationMs: 3000,
      voiceActivity: voiceActivity({ lastVoiceAt: Date.now() - 2000 }),
      lastVoiceAtMs: Date.now() - 2000,
      semanticCheck: async () => 'done',
    }))
    expect(result.judgment).toBe('submit')
    expect(result.reason).toBe('llm_done')
  })

  it('submits when L2 times out', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'I think the weather is nice today',
      listeningDurationMs: 3000,
      voiceActivity: voiceActivity({ lastVoiceAt: Date.now() - 2000 }),
      lastVoiceAtMs: Date.now() - 2000,
      semanticCheck: () => new Promise<'thinking'>(() => {}),
    }), { semanticTimeoutMs: 1 })
    expect(result.judgment).toBe('submit')
    expect(result.reason).toBe('llm_done')
  })

  it('falls back to submit when L2 throws', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'I was wondering about something',
      listeningDurationMs: 3000,
      voiceActivity: voiceActivity({ lastVoiceAt: Date.now() - 2000 }),
      lastVoiceAtMs: Date.now() - 2000,
      semanticCheck: async () => { throw new Error('Network error') },
    }))
    expect(result.judgment).toBe('submit')
    expect(result.reason).toBe('confident_complete')
  })

  it('continues when pause is too short for L2', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'I think the most important thing',
      listeningDurationMs: 3000,
      lastVoiceAtMs: Date.now() - 200,
      semanticCheck: async () => 'done',
    }))
    expect(result.judgment).toBe('continue')
    expect(result.reason).toBe('no_transcript_yet')
  })
})
