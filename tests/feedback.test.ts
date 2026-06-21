import {
  describe,
  expect,
  it,
} from 'vitest'

import { createAppFeedbackStore } from '@meteorvoice/shared'

describe('app feedback store', () => {
  it('keeps feedback state isolated per store', () => {
    const first = createAppFeedbackStore()
    const second = createAppFeedbackStore()

    first.show({ message: 'Loading', source: 'settings' })

    expect(first.getFeedback()?.message).toBe('Loading')
    expect(second.getFeedback()).toBeNull()
  })

  it('publishes the most recent active source', () => {
    const store = createAppFeedbackStore()

    store.show({ message: 'First', source: 'first' })
    store.show({ message: 'Second', source: 'second' })
    store.hide('second')

    expect(store.getFeedback()?.message).toBe('First')
  })

  it('notifies subscribers on changes', () => {
    const store = createAppFeedbackStore()
    const messages: (string | null)[] = []
    const unsubscribe = store.subscribe(feedback => {
      messages.push(feedback?.message ?? null)
    })

    store.show({ message: 'Saved' })
    unsubscribe()
    store.show({ message: 'Ignored' })

    expect(messages).toEqual([null, 'Saved'])
  })
})
