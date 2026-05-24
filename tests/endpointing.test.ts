import { describe, expect, it } from 'vitest'
import {
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

describe('judgeTurnLocally (L1)', () => {
  it('returns complete for sentence ending with period', () => {
    expect(judgeTurnLocally('The weather is nice today.')).toBe('complete')
  })

  it('returns complete for sentence ending with question mark', () => {
    expect(judgeTurnLocally('What time is it?')).toBe('complete')
  })

  it('returns complete for short answers', () => {
    expect(judgeTurnLocally('Yes')).toBe('complete')
    expect(judgeTurnLocally('No')).toBe('complete')
    expect(judgeTurnLocally('I see')).toBe('complete')
    expect(judgeTurnLocally('Got it')).toBe('complete')
    expect(judgeTurnLocally('OK')).toBe('complete')
  })

  it('returns incomplete for trailing conjunction', () => {
    expect(judgeTurnLocally('I went there and')).toBe('incomplete')
    expect(judgeTurnLocally('The reason is because')).toBe('incomplete')
  })

  it('returns incomplete for filler endings', () => {
    expect(judgeTurnLocally('I think that um')).toBe('incomplete')
    expect(judgeTurnLocally('Maybe we should uh')).toBe('incomplete')
  })

  it('returns incomplete for trailing articles', () => {
    expect(judgeTurnLocally('I saw a')).toBe('incomplete')
    expect(judgeTurnLocally('This is the')).toBe('incomplete')
  })

  it('returns uncertain for long sentence without punctuation', () => {
    expect(judgeTurnLocally('I think the most important thing is that we should consider all options')).toBe('uncertain')
  })

  it('returns incomplete for short 2-word phrase (likely mid-sentence)', () => {
    expect(judgeTurnLocally('I want')).toBe('incomplete')
  })

  it('returns uncertain for moderate-length text without clear ending', () => {
    expect(judgeTurnLocally('I want to go')).toBe('uncertain')
  })

  it('returns uncertain for empty string', () => {
    expect(judgeTurnLocally('')).toBe('uncertain')
    expect(judgeTurnLocally('   ')).toBe('uncertain')
  })

  it('returns complete for complete sentence with punctuation', () => {
    expect(judgeTurnLocally('I went to the store')).toBe('uncertain')
    expect(judgeTurnLocally('I went to the store.')).toBe('complete')
  })
})

describe('judgeEndpoint (orchestration)', () => {
  it('submits immediately when L1 is confident complete', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'The weather is really nice today.',
      listeningDurationMs: 3000,
    }))
    expect(result.judgment).toBe('submit')
    expect(result.reason).toBe('confident_complete')
  })

  it('continues when L1 is confident incomplete', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'I want to go to the',
      listeningDurationMs: 2000,
    }))
    expect(result.judgment).toBe('continue')
    expect(result.reason).toBe('confident_incomplete')
  })

  it('continues when voice is still active', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'I think it is important but not sure',
      listeningDurationMs: 5000,
      voiceActivity: voiceActivity({ isVoiceActive: true, lastVoiceAt: Date.now(), level: 0.5 }),
    }))
    expect(result.judgment).toBe('continue')
  })

  it('continues when no transcript yet', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: '',
      listeningDurationMs: 8000,
    }))
    expect(result.judgment).toBe('continue')
    expect(result.reason).toBe('no_transcript_yet')
  })

  it('submits on max listening timeout after 45s', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'I was thinking that maybe we could',
      listeningDurationMs: 46000, // > 45s max listening
    }))
    expect(result.judgment).toBe('submit')
    expect(result.reason).toBe('max_listening_timeout')
  })

  it('submits on max silence timeout after 8s of no voice', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'I think the most important thing is that we should consider',
      listeningDurationMs: 5000,
      lastVoiceAtMs: Date.now() - 9000, // > 8s silence
    }))
    expect(result.judgment).toBe('submit')
    expect(result.reason).toBe('max_silence_timeout')
  })

  it('calls LLM for uncertain transcript after pause (no isFinalResult bypass)', async () => {
    const results: string[] = []
    const result = await judgeEndpoint(baseInput({
      transcript: 'I think the most important thing is that we should',
      listeningDurationMs: 3000,
      isFinalResult: false,
      voiceActivity: voiceActivity({ lastVoiceAt: Date.now() - 1000 }),
      messages: [
        { role: 'user' as const, content: 'What do you think about AI?' },
        { role: 'assistant' as const, content: 'AI is a fascinating topic. What specific aspect interests you?' },
      ],
      semanticCheck: async (transcript) => {
        results.push(transcript)
        return 'thinking'
      },
    }))
    expect(results).toHaveLength(1)
    expect(result.judgment).toBe('continue')
    expect(result.reason).toBe('llm_thinking')
  })

  it('calls LLM and returns done', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'I think AI will change the world',
      listeningDurationMs: 3000,
      isFinalResult: false,
      voiceActivity: voiceActivity({ lastVoiceAt: Date.now() - 2000 }),
      messages: [
        { role: 'user' as const, content: 'What do you think about AI?' },
        { role: 'assistant' as const, content: 'AI is a fascinating topic.' },
      ],
      semanticCheck: async () => 'done',
    }))
    expect(result.judgment).toBe('submit')
    expect(result.reason).toBe('llm_done')
  })

  it('calls LLM even when this is the first turn without history', async () => {
    const calls: string[] = []
    const result = await judgeEndpoint(baseInput({
      transcript: 'I think the best part is',
      listeningDurationMs: 3000,
      voiceActivity: voiceActivity({ lastVoiceAt: Date.now() - 2000 }),
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

  it('submits when semantic endpoint check times out', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'I think the weather is nice today',
      listeningDurationMs: 3000,
      voiceActivity: voiceActivity({ lastVoiceAt: Date.now() - 2000 }),
      semanticCheck: () => new Promise<'thinking'>(() => {}),
    }), { semanticTimeoutMs: 1 })
    expect(result.judgment).toBe('submit')
    expect(result.reason).toBe('llm_done')
  })

  it('falls back to submit when L2 semanticCheck throws', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'I was wondering about something',
      listeningDurationMs: 3000,
      voiceActivity: voiceActivity({ lastVoiceAt: Date.now() - 2000 }),
      messages: [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi, how can I help?' },
      ],
      semanticCheck: async () => { throw new Error('Network error') },
    }))
    expect(result.judgment).toBe('submit')
    expect(result.reason).toBe('confident_complete')
  })

  it('continues when pause is too short for L2', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'I think the most important thing is that we should',
      listeningDurationMs: 3000,
      lastVoiceAtMs: Date.now() - 200, // < 500ms pause
      messages: [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi!' },
      ],
      semanticCheck: async () => 'done',
    }))
    expect(result.judgment).toBe('continue')
    expect(result.reason).toBe('confident_incomplete')
  })

  it('submits when no transcript and silence timeout exceeded', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: '',
      listeningDurationMs: 10000,
      lastVoiceAtMs: Date.now() - 10000, // > 8s silence
    }))
    expect(result.judgment).toBe('submit')
    expect(result.reason).toBe('max_silence_timeout')
  })

  it('submits with confident_complete when no semanticCheck provided', async () => {
    const result = await judgeEndpoint(baseInput({
      transcript: 'I think the weather is nice today',
      listeningDurationMs: 3000,
      voiceActivity: voiceActivity({ lastVoiceAt: Date.now() - 2000 }),
      // no semanticCheck
    }))
    expect(result.judgment).toBe('submit')
    expect(result.reason).toBe('confident_complete')
  })
})
