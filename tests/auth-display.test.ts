import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  getUserDisplayName,
  getUserInitial,
  isInternalAliasEmail,
} from '@/lib/auth/display'

describe('auth display helpers', () => {
  it('prefers display name before username and email', () => {
    expect(getUserDisplayName({
      email: 'alex@example.com',
      phone: undefined,
      user_metadata: { display_name: 'Alex Chen', username: 'alex' },
    })).toBe('Alex Chen')
  })

  it('falls back to username', () => {
    expect(getUserDisplayName({
      email: 'alex@users.meteorvoice.local',
      phone: undefined,
      user_metadata: { username: 'alex' },
    })).toBe('alex')
  })

  it('masks phone numbers', () => {
    expect(getUserDisplayName({
      email: undefined,
      phone: '+8613800138000',
      user_metadata: {},
    })).toBe('+86****8000')
  })

  it('does not expose internal alias emails', () => {
    expect(isInternalAliasEmail('alex@users.meteorvoice.local')).toBe(true)
    expect(getUserDisplayName({
      email: 'alex@users.meteorvoice.local',
      phone: undefined,
      user_metadata: {},
    })).toBeNull()
  })

  it('allows public email display as last resort', () => {
    expect(getUserDisplayName({
      email: 'alex@example.com',
      phone: undefined,
      user_metadata: {},
    })).toBe('alex@example.com')
  })

  it('derives display initials', () => {
    expect(getUserInitial(' Alex Chen ')).toBe('A')
    expect(getUserInitial(null)).toBe('?')
  })
})
