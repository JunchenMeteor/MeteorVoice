import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  createLazyTranslator,
  createTranslator,
  interpolate,
  translate,
  translateWithResources,
} from '@meteorvoice/shared'

describe('i18n interpolation', () => {
  it('interpolates named values', () => {
    expect(translate('en', 'settings.xunfei_voice_expires', { date: '2026-06-30' })).toBe('Trial expires at 2026-06-30.')
    expect(translate('zh', 'history.turns_count', { count: 2 })).toBe('2 轮')
  })

  it('formats a small ICU plural subset', () => {
    expect(translate('en', 'session.corrections_count', { count: 1 })).toBe('1 correction')
    expect(translate('en', 'session.corrections_count', { count: 3 })).toBe('3 corrections')
    expect(interpolate('{count, plural, =0 {No turns} one {# turn} other {# turns}}', { count: 0 })).toBe('No turns')
  })

  it('supports injected resources for lazy loading boundaries', () => {
    const resources = {
      en: { greeting: 'Hello {name}' },
      zh: { greeting: '你好 {name}' },
    }

    expect(translateWithResources(resources, 'zh', 'greeting', { name: 'Meteor' })).toBe('你好 Meteor')
    expect(createTranslator('en', resources)('greeting', { name: 'Meteor' })).toBe('Hello Meteor')
  })

  it('loads translation resources on demand', async () => {
    const translator = createLazyTranslator({ en: { greeting: 'Hello' } })

    await translator.load('zh', async () => ({ greeting: '你好' }))

    expect(translator.translate('zh', 'greeting')).toBe('你好')
    expect(translator.translate('zh', 'missing.key')).toBe('missing.key')
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
