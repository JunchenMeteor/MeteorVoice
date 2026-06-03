'use client'

import { useEffect, useState } from 'react'
import { appFeedback, hideAppFeedback, type AppFeedbackState } from '@meteorvoice/shared'

export default function AppFeedbackPresenter() {
  const [feedback, setFeedback] = useState<AppFeedbackState | null>(() => appFeedback.getFeedback())

  useEffect(() => appFeedback.subscribe(setFeedback), [])

  useEffect(() => {
    if (!feedback?.active || !feedback.autoDismissMs) return
    const timer = window.setTimeout(() => {
      hideAppFeedback(feedback.source)
    }, feedback.autoDismissMs)
    return () => window.clearTimeout(timer)
  }, [feedback?.active, feedback?.autoDismissMs, feedback?.source])

  if (!feedback?.active) return null

  const variant = feedback.variant ?? 'hud'
  const blocksInteraction = feedback.blocksInteraction ?? true
  const overlayClass = [
    'fixed z-50 px-4',
    blocksInteraction ? 'pointer-events-auto' : 'pointer-events-none',
    variant === 'bar'
      ? 'left-0 right-0 top-3 flex justify-center'
      : 'inset-0 flex items-center justify-center',
    variant === 'bar' ? '' : 'bg-[var(--theme-overlay)]',
  ].filter(Boolean).join(' ')
  const surfaceClass = [
    'flex items-center gap-3 border border-[var(--theme-border)] bg-[var(--theme-bg-card)] text-[var(--theme-text-primary)] shadow-lg',
    variant === 'bar' ? 'min-w-[min(32rem,calc(100vw-2rem))] rounded-lg px-4 py-3' : 'max-w-sm rounded-lg px-5 py-4',
    variant === 'panel' ? 'flex-col text-center' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={overlayClass} role="status" aria-live="polite">
      <div className={surfaceClass}>
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--theme-border)] border-t-[var(--theme-accent)]" />
        <span className={variant === 'panel' ? 'space-y-1' : 'min-w-0'}>
          {feedback.title ? <span className="block text-sm font-semibold">{feedback.title}</span> : null}
          <span className="block text-sm font-medium">{feedback.message}</span>
        </span>
      </div>
    </div>
  )
}
