import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  AIProviderUnavailableError,
  createAICoach,
} from '@/lib/providers/ai-provider'

const context = {
  scenario: { name: 'Small talk', description: 'Practice casual conversation' },
  accentProfile: { name: 'American', region: 'United States' },
  sessionId: 'session-1',
  turnNumber: 1,
} as const

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('AI provider production semantics', () => {
  it('fails explicitly when production has no configured provider', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEEPSEEK_API_KEY', '')
    vi.stubEnv('AI_PROVIDER', 'deepseek')

    await expect(createAICoach().generateReply([
      { role: 'user', content: 'Hello' },
    ], context)).rejects.toBeInstanceOf(AIProviderUnavailableError)
  })

  it('keeps explicit mock mode available for local and test environments', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DEEPSEEK_API_KEY', '')
    vi.stubEnv('AI_PROVIDER', 'mock')

    await expect(createAICoach().generateReply([
      { role: 'user', content: 'Hello' },
    ], context)).resolves.toMatchObject({
      text: expect.any(String),
      corrections: expect.any(Array),
    })
  })
})
