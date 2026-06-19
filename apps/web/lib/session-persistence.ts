import { createInitialSnapshot, type WorkflowSnapshot } from '@/lib/conversation-workflow'
import type { ConversationResponse } from '@/lib/providers/types'

export const activeSessionStorageKey = 'meteorvoice-active-session'
export const voiceSessionStateStorageKey = 'meteorvoice-session-state'

export interface PersistedVoiceSessionState {
  scenarioKey: string
  accentKey: string
  snapshot: WorkflowSnapshot
  statusText: string
  isSessionActive: boolean
  isRoutePaused: boolean
  corrections: ConversationResponse['corrections']
  summary: string | null
}

export function createClientSessionId() {
  const browserCrypto = globalThis.crypto
  if (typeof browserCrypto?.randomUUID === 'function') return browserCrypto.randomUUID()

  if (typeof browserCrypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    browserCrypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  throw new Error('Web Crypto is required to create a voice session id')
}

export function createDefaultPersistedState(): PersistedVoiceSessionState {
  return {
    scenarioKey: 'small-talk',
    accentKey: 'american',
    snapshot: createInitialSnapshot(createClientSessionId()),
    statusText: '',
    isSessionActive: false,
    isRoutePaused: false,
    corrections: [],
    summary: null,
  }
}

export function readPersistedSessionState(): PersistedVoiceSessionState {
  if (typeof window === 'undefined') return createDefaultPersistedState()

  try {
    const raw = sessionStorage.getItem(voiceSessionStateStorageKey)
    if (!raw) return createDefaultPersistedState()
    const parsed = JSON.parse(raw) as Partial<PersistedVoiceSessionState>
    if (!parsed.snapshot?.sessionId) return createDefaultPersistedState()

    return {
      scenarioKey: parsed.scenarioKey ?? 'small-talk',
      accentKey: parsed.accentKey ?? 'american',
      snapshot: parsed.snapshot,
      statusText: parsed.statusText ?? '',
      isSessionActive: parsed.isSessionActive === true,
      isRoutePaused: parsed.isRoutePaused === true,
      corrections: parsed.corrections ?? [],
      summary: parsed.summary ?? null,
    }
  } catch {
    return createDefaultPersistedState()
  }
}

export function publishActiveSession(active: boolean) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(activeSessionStorageKey, active ? 'true' : 'false')
  window.dispatchEvent(new CustomEvent('meteorvoice-active-session-change', { detail: { active } }))
}
