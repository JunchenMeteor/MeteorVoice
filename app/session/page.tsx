import { Suspense } from 'react'
import { SessionPageClient } from './SessionPage'

export default function SessionPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[var(--theme-text-muted)]">Loading session...</div>}>
      <SessionPageClient />
    </Suspense>
  )
}
