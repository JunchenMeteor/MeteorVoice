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
type FeedbackEntry = AppFeedbackState & {
  source: string
  order: number
}

let appFeedbackState: AppFeedbackState | null = null
let feedbackOrder = 0
const feedbackBySource = new Map<string, FeedbackEntry>()
const feedbackListeners = new Set<FeedbackListener>()
const defaultFeedbackSource = 'app'

function emitAppFeedback(next: AppFeedbackState | null) {
  if (isSameFeedback(appFeedbackState, next)) return
  appFeedbackState = next
  feedbackListeners.forEach(listener => listener(appFeedbackState))
}

function publishActiveFeedback() {
  const next = Array.from(feedbackBySource.values())
    .sort((a, b) => a.order - b.order)
    .at(-1) ?? null

  if (!next) {
    emitAppFeedback(null)
    return
  }

  emitAppFeedback({
    active: next.active,
    message: next.message,
    variant: next.variant,
    source: next.source,
    title: next.title,
    severity: next.severity,
    blocksInteraction: next.blocksInteraction,
    dismissible: next.dismissible,
    autoDismissMs: next.autoDismissMs,
  })
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
    const source = feedback.source ?? defaultFeedbackSource
    const next: FeedbackEntry = {
      ...feedback,
      source,
      active: feedback.active ?? true,
      order: feedbackOrder + 1,
    }
    const existing = feedbackBySource.get(source)
    if (existing && isSameFeedback(existing, next)) return
    feedbackOrder = next.order
    feedbackBySource.set(source, next)
    publishActiveFeedback()
  },

  hide(source?: string) {
    if (!source) {
      feedbackBySource.clear()
      emitAppFeedback(null)
      return
    }
    feedbackBySource.delete(source)
    publishActiveFeedback()
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
