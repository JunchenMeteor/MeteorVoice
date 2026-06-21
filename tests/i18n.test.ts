import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  interpolate,
  translate,
} from '@meteorvoice/shared'

describe('i18n interpolation', () => {
  it('interpolates named values', () => {
    expect(translate('en', 'session.corrections_count', { count: 3 })).toBe('3 corrections')
    expect(translate('zh', 'history.turns_count', { count: 2 })).toBe('2 轮')
  })

  it('falls back to English and then the key', () => {
    expect(translate('zh', 'nav.home')).toBe('首页')
    expect(translate('zh', 'missing.key')).toBe('missing.key')
  })

  it('keeps missing placeholders intact', () => {
    expect(interpolate('Trial expires at {date}.')).toBe('Trial expires at {date}.')
    expect(interpolate('Trial expires at {date}.', {})).toBe('Trial expires at {date}.')
  })
})
