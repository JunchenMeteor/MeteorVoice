/**
 * App feedback system (pub-sub, multi-source merge).
 * 应用反馈系统（发布订阅、多源合并）。
 */
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
export type AppFeedbackStore = {
  getFeedback: () => AppFeedbackState | null
  subscribe: (listener: FeedbackListener) => () => void
  show: (feedback: AppFeedbackInput) => void
  hide: (source?: string) => void
}

const defaultFeedbackSource = 'app'

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

/**
 * Creates an isolated feedback store for app runtime or tests.
 * 创建隔离的反馈 store，供应用运行时或测试使用。
 */
export function createAppFeedbackStore(): AppFeedbackStore {
  let feedbackState: AppFeedbackState | null = null
  let feedbackOrder = 0
  const feedbackBySource = new Map<string, FeedbackEntry>()
  const feedbackListeners = new Set<FeedbackListener>()

  function emit(next: AppFeedbackState | null) {
    if (isSameFeedback(feedbackState, next)) return
    feedbackState = next
    feedbackListeners.forEach(listener => listener(feedbackState))
  }

  function publishActive() {
    const next = Array.from(feedbackBySource.values())
      .sort((a, b) => a.order - b.order)
      .at(-1) ?? null

    if (!next) {
      emit(null)
      return
    }

    emit({
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

  return {
    getFeedback() {
      return feedbackState
    },

    subscribe(listener: FeedbackListener) {
      feedbackListeners.add(listener)
      listener(feedbackState)
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
      publishActive()
    },

    hide(source?: string) {
      if (!source) {
        feedbackBySource.clear()
        emit(null)
        return
      }
      feedbackBySource.delete(source)
      publishActive()
    }
  }
}

/**
 * Global singleton for managing application feedback state, subscriptions, and show/hide lifecycle.
 * 管理应用反馈状态、订阅以及显示/隐藏生命周期的全局单例。
 */
export const appFeedback = createAppFeedbackStore()

/**
 * Shows application feedback using the global feedback system.
 * 使用全局反馈系统显示应用反馈。
 */
export function showAppFeedback(feedback: AppFeedbackInput) {
  appFeedback.show(feedback)
}

/**
 * Hides application feedback for the given source. If no source is provided, clears all feedback.
 * 隐藏指定来源的应用反馈。未提供来源时清空所有反馈。
 */
export function hideAppFeedback(source?: string) {
  appFeedback.hide(source)
}

/**
 * Displays error feedback when conditions are met (presentation is not inline or silent, and shouldDisplay is true).
 * 在满足条件时显示错误反馈（展示模式不是 inline 或 silent，且 shouldDisplay 为 true）。
 */
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
