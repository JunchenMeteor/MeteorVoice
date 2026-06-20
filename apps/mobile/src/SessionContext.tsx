import { createContext, useContext } from 'react'
import type { ConversationMessage, ConversationResponse, Locale } from '@meteorvoice/shared'
import type { WorkflowSnapshot } from '@meteorvoice/session-core'
import type { MeteorVoiceApiClient } from '@meteorvoice/api-client'

export interface SessionContextValue {
  // 会话数据
  snapshot: WorkflowSnapshot
  messages: ConversationMessage[]
  corrections: ConversationResponse['corrections']
  summary: string | null

  // 会话状态
  isSessionActive: boolean
  status: string
  busy: boolean
  scenarioSwitching: boolean

  // 显示/i18n
  locale: Locale
  tr: (key: string) => string

  // 场景/口音/Provider
  ttsProvider: string
  ttsVoiceId: string | null
  selectedScenarioKey: string
  selectedAccentKey: string
  voiceProfileAccentLabel: string | null
  voiceProfileAccentRegion: string | null

  // 音频
  audioUrl: string | null

  // 网络/鉴权
  api: MeteorVoiceApiClient

  // 操作
  startSession: () => Promise<void>
  endSession: () => Promise<void>
  submitText: (text: string) => void
  playCorrection: (text: string) => void
  selectScenario: (key: string) => Promise<boolean>
  setLocale: (l: Locale) => void
  clearAudio: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    throw new Error('useSession must be used within AppInner (SessionContext.Provider)')
  }
  return ctx
}

export { SessionContext }
