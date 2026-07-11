/**
 * Persistent queue for completed sessions that could not reach the API.
 */
import type { SyncSessionRequest } from '@meteorvoice/api-client'

export interface SessionSyncOutboxStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export type PendingSessionSync = {
  payload: SyncSessionRequest
  queuedAt: number
  attempts: number
  lastAttemptAt?: number
}

const storageKey = 'meteorvoice.session-sync-outbox.v1'
const maxPendingSessions = 20

export async function loadSessionSyncOutbox(storage: SessionSyncOutboxStorage): Promise<PendingSessionSync[]> {
  const raw = await storage.getItem(storageKey)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; items?: unknown }
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) return []
    return parsed.items.filter(isPendingSessionSync).slice(-maxPendingSessions)
  } catch {
    return []
  }
}

export async function enqueueSessionSync(
  storage: SessionSyncOutboxStorage,
  payload: SyncSessionRequest,
  now = Date.now(),
) {
  const current = await loadSessionSyncOutbox(storage)
  const next = current.filter(item => item.payload.session_id !== payload.session_id)
  next.push({ payload, queuedAt: now, attempts: 0 })
  await saveSessionSyncOutbox(storage, next.slice(-maxPendingSessions))
}

export async function flushSessionSyncOutbox(
  storage: SessionSyncOutboxStorage,
  sync: (payload: SyncSessionRequest) => Promise<unknown>,
  now = Date.now(),
) {
  const pending = await loadSessionSyncOutbox(storage)
  let attempted = 0
  let synced = 0

  while (pending.length > 0) {
    const item = pending[0]
    attempted += 1
    try {
      await sync(item.payload)
      pending.shift()
      synced += 1
      await saveSessionSyncOutbox(storage, pending)
    } catch {
      pending[0] = {
        ...item,
        attempts: item.attempts + 1,
        lastAttemptAt: now,
      }
      await saveSessionSyncOutbox(storage, pending)
      break
    }
  }

  return { attempted, synced, remaining: pending.length }
}

async function saveSessionSyncOutbox(storage: SessionSyncOutboxStorage, items: PendingSessionSync[]) {
  if (items.length === 0) {
    await storage.removeItem(storageKey)
    return
  }
  await storage.setItem(storageKey, JSON.stringify({ version: 1, items }))
}

function isPendingSessionSync(value: unknown): value is PendingSessionSync {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<PendingSessionSync>
  return Boolean(
    item.payload &&
    typeof item.payload === 'object' &&
    typeof item.payload.session_id === 'string' &&
    typeof item.queuedAt === 'number' &&
    typeof item.attempts === 'number',
  )
}
