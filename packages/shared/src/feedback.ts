export type AppFeedbackVariant = 'hud' | 'panel' | 'bar'
export type AppFeedbackSeverity = 'info' | 'warning' | 'error'
export type AppFeedbackPresentation =
  | 'inline'
  | 'toast'
  | 'alert'
  | 'banner'
  | 'sheet'
  | 'blocking'
  | 'silent'

export type AppFeedbackState = {
  active: boolean
  message: string
  variant?: AppFeedbackVariant
  source?: string
  title?: string
  severity?: AppFeedbackSeverity
  blocksInteraction?: boolean
  dismissible?: boolean
  autoDismissMs?: number
}

export type AppFeedbackInput = Omit<AppFeedbackState, 'active'> & {
  active?: boolean
}

export type DisplayableErrorFeedback = {
  title?: string
  displayMessage: string
  presentation: AppFeedbackPresentation
  severity?: AppFeedbackSeverity
  shouldDisplay: boolean
  blocksInteraction: boolean
  dismissible: boolean
  autoDismissMs?: number
}

type FeedbackListener = (feedback: AppFeedbackState | null) => void

let appFeedbackState: AppFeedbackState | null = null
const feedbackListeners = new Set<FeedbackListener>()

function emitAppFeedback(next: AppFeedbackState | null) {
  if (isSameFeedback(appFeedbackState, next)) return
  appFeedbackState = next
  feedbackListeners.forEach(listener => listener(appFeedbackState))
}

function isSameFeedback(current: AppFeedbackState | null, next: AppFeedbackState | null) {
  if (current === next) return true
  if (!current || !next) return false
  return current.active === next.active &&
    current.message === next.message &&
    current.variant === next.variant &&
    current.source === next.source &&
    current.title === next.title &&
    current.severity === next.severity &&
    current.blocksInteraction === next.blocksInteraction &&
    current.dismissible === next.dismissible &&
    current.autoDismissMs === next.autoDismissMs
}

export const appFeedback = {
  getFeedback() {
    return appFeedbackState
  },

  subscribe(listener: FeedbackListener) {
    feedbackListeners.add(listener)
    listener(appFeedbackState)
    return () => {
      feedbackListeners.delete(listener)
    }
  },

  show(feedback: AppFeedbackInput) {
    emitAppFeedback({
      ...feedback,
      active: feedback.active ?? true,
    })
  },

  hide(source?: string) {
    if (source && appFeedbackState?.source !== source) return
    emitAppFeedback(null)
  },
}

export function showAppFeedback(feedback: AppFeedbackInput) {
  appFeedback.show(feedback)
}

export function hideAppFeedback(source?: string) {
  appFeedback.hide(source)
}

export function displayErrorFeedback(error: DisplayableErrorFeedback, source: string) {
  if (!error.shouldDisplay || error.presentation === 'inline' || error.presentation === 'silent') {
    return
  }

  appFeedback.show({
    source,
    title: error.title,
    message: error.displayMessage,
    severity: error.severity,
    variant: getFeedbackVariant(error.presentation),
    blocksInteraction: error.blocksInteraction,
    dismissible: error.dismissible,
    autoDismissMs: error.autoDismissMs,
  })
}

function getFeedbackVariant(presentation: AppFeedbackPresentation): AppFeedbackVariant {
  if (presentation === 'banner') return 'bar'
  if (presentation === 'alert' || presentation === 'sheet') return 'panel'
  return 'hud'
}
