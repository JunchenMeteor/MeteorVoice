import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  enqueueSessionSync,
  flushSessionSyncOutbox,
  loadSessionSyncOutbox,
} from '../apps/mobile/src/sessionSyncOutbox'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value) },
    removeItem: async (key: string) => { values.delete(key) },
  }
}

function payload(sessionId: string) {
  return {
    session_id: sessionId,
    scenario: 'Small talk',
    accent: 'American',
    turns: 1,
    messages: [{ role: 'user' as const, content: 'Hello' }],
    corrections: [],
  }
}

describe('mobile session sync outbox', () => {
  it('persists pending sessions and replaces duplicate session ids', async () => {
    const storage = createStorage()

    await enqueueSessionSync(storage, payload('session-1'), 100)
    await enqueueSessionSync(storage, { ...payload('session-1'), turns: 2 }, 200)

    await expect(loadSessionSyncOutbox(storage)).resolves.toEqual([{
      payload: { ...payload('session-1'), turns: 2 },
      queuedAt: 200,
      attempts: 0,
    }])
  })

  it('removes successful entries and keeps the first failed entry for retry', async () => {
    const storage = createStorage()
    await enqueueSessionSync(storage, payload('session-1'), 100)
    await enqueueSessionSync(storage, payload('session-2'), 200)
    const sync = vi.fn()
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('offline'))

    await expect(flushSessionSyncOutbox(storage, sync, 300)).resolves.toEqual({
      attempted: 2,
      synced: 1,
      remaining: 1,
    })
    expect(sync).toHaveBeenCalledTimes(2)
    await expect(loadSessionSyncOutbox(storage)).resolves.toMatchObject([{
      payload: { session_id: 'session-2' },
      attempts: 1,
    }])
  })
})
