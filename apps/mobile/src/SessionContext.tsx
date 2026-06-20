import { createContext, useContext } from 'react'
import type { ConversationMessage, ConversationResponse } from '@meteorvoice/shared'
import type { WorkflowSnapshot } from '@meteorvoice/session-core'

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
  ttsProvider: string
  ttsVoiceId: string | null

  // 音频
  audioUrl: string | null

  // 场景 / 口音
  selectedScenarioKey: string
  selectedAccentKey: string
  voiceProfileAccentLabel: string | null
  voiceProfileAccentRegion: string | null

  // 操作
  startSession: () => Promise<void>
  endSession: () => Promise<void>
  submitText: (text: string) => void
  playCorrection: (text: string) => void
  selectScenario: (key: string) => Promise<boolean>
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
