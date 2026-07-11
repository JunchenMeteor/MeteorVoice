import {
  describe,
  expect,
  it,
} from 'vitest'

import { getHistoryLoadRequestKey } from '../apps/mobile/src/historyRefresh'

describe('mobile history refresh lifecycle', () => {
  it('does not load history before authentication succeeds', () => {
    expect(getHistoryLoadRequestKey('loading', null, 1)).toBeNull()
    expect(getHistoryLoadRequestKey('signed-out', null, 1)).toBeNull()
    expect(getHistoryLoadRequestKey('signed-in', null, 1)).toBeNull()
  })

  it('loads after sign-in and reloads whenever the tab receives focus again', () => {
    const firstFocus = getHistoryLoadRequestKey('signed-in', 'user-1', 1)
    const secondFocus = getHistoryLoadRequestKey('signed-in', 'user-1', 2)

    expect(firstFocus).toBe('user-1:1')
    expect(secondFocus).toBe('user-1:2')
    expect(secondFocus).not.toBe(firstFocus)
  })

  it('uses the user id to prevent history from leaking across accounts', () => {
    expect(getHistoryLoadRequestKey('signed-in', 'user-1', 1))
      .not.toBe(getHistoryLoadRequestKey('signed-in', 'user-2', 1))
  })
})
