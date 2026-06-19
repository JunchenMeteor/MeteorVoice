import { t as translations } from '@meteorvoice/shared'
import type { WorkflowState } from '@/lib/conversation-workflow'

const sessionStatusKeys = [
  'session.ready',
  'session.loading_voice',
  'session.paused',
  'session.listening',
  'session.transcribing',
  'session.thinking',
  'session.preparing_reply',
  'session.speaking',
  'session.playback_blocked',
  'session.correcting',
  'session.ended',
  'session.tap_mic',
  'session.no_speech',
  'session.waiting_for_speech',
  'session.stt_unavailable',
] as const

export function isKnownLocalizedSessionStatus(statusText: string) {
  return Object.values(translations).some(localeTable =>
    sessionStatusKeys.some(key => localeTable[key] === statusText),
  )
}

export function getSessionStatusKey(input: {
  activeSession: boolean
  routePaused: boolean
  workflowState: WorkflowState
}) {
  if (input.routePaused) return 'session.paused'
  if (input.workflowState === 'session_ended') return 'session.ended'
  if (!input.activeSession) return 'session.ready'

  switch (input.workflowState) {
    case 'listening':
      return 'session.listening'
    case 'transcribing':
      return 'session.transcribing'
    case 'thinking':
      return 'session.preparing_reply'
    case 'speaking':
      return 'session.speaking'
    case 'correcting':
      return 'session.correcting'
    case 'idle':
      return 'session.tap_mic'
    default:
      return 'session.ready'
  }
}
