/**
 * SessionContext — session state and operations shared across screens.
 * 会话上下文 — 跨 Screen 共享的会话状态和操作。
 *
 * AppInner acts as the provider, populating all fields from orchestration state.
 * Screen components consume via useSession() instead of prop drilling.
 * Only data keys (not display labels) live here — consumers compute their own labels.
 * AppInner 作为 provider，编排状态填充所有字段。Screen 组件通过 useSession() 消费，
 * 无需 prop drilling。Context 只放数据 key，显示标签由消费者自己计算。
 */
import {
  createContext,
  useContext,
} from 'react'

import type {
  MeteorVoiceApiClient,
  PreferencesResponse,
} from '@meteorvoice/api-client'
import type { WorkflowSnapshot } from '@meteorvoice/session-core'
import type {
  ConversationMessage,
  ConversationResponse,
  Locale,
  Scenario,
  TranslateFn,
} from '@meteorvoice/shared'
import type { MobileAuthState } from './mobileAuth'

export interface SessionContextValue {
  api: MeteorVoiceApiClient
  appVersion: string
  applyTtsPreferences: (preferences: PreferencesResponse) => void
  auth: MobileAuthState
  audioUrl: string | null
  availableScenarios: Scenario[]
  busy: boolean
  clearAudio: () => void
  corrections: ConversationResponse['corrections']
  endSession: () => Promise<void>
  defaultApiBaseUrl: string
  getAuthHeaders: () => Promise<HeadersInit>
  handleUnauthorized: () => void
  isSessionActive: boolean
  locale: Locale
  messages: ConversationMessage[]
  playCorrection: (text: string) => void
  scenarioSwitching: boolean
  selectScenario: (key: string) => Promise<boolean>
  selectedAccentKey: string
  selectedScenarioKey: string
  setLocale: (l: Locale) => void
  signOut: (nextMessage?: string | null) => Promise<void>
  snapshot: WorkflowSnapshot
  startSession: () => Promise<void>
  status: string
  submitText: (text: string) => void
  summary: string | null
  tr: TranslateFn
  ttsProvider: string
  ttsVoiceId: string | null
  voiceProfileAccentLabel: string | null
  voiceProfileAccentRegion: string | null
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within AppInner (SessionContext.Provider)')
  return ctx
}

export { SessionContext }
