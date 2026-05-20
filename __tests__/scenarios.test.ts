import { describe, expect, it } from 'vitest'
import {
  accentProfiles,
  findAccentByKeyOrName,
  findScenarioByKeyOrName,
  getAccentLabel,
  getAccentRegion,
  getDifficultyLabel,
  getScenarioDescription,
  getScenarioLabel,
  scenarios,
} from '@/lib/scenarios'

describe('localized scenario content', () => {
  it('returns localized scenario labels and descriptions', () => {
    const scenario = scenarios.find(s => s.key === 'travel')
    expect(scenario).toBeDefined()
    expect(getScenarioLabel(scenario!, 'en')).toBe('Travel')
    expect(getScenarioLabel(scenario!, 'zh')).toBe('旅行')
    expect(getScenarioDescription(scenario!, 'zh')).toContain('机场')
  })

  it('returns localized difficulty labels', () => {
    expect(getDifficultyLabel('beginner', 'en')).toBe('Beginner')
    expect(getDifficultyLabel('intermediate', 'zh')).toBe('中级')
  })

  it('finds scenarios by stable keys and localized labels', () => {
    expect(findScenarioByKeyOrName('small-talk')?.key).toBe('small-talk')
    expect(findScenarioByKeyOrName('日常闲聊')?.key).toBe('small-talk')
    expect(findScenarioByKeyOrName('Daily Small Talk')?.key).toBe('small-talk')
  })
})

describe('localized accent content', () => {
  it('returns localized accent labels and regions', () => {
    const accent = accentProfiles.find(a => a.key === 'american')
    expect(accent).toBeDefined()
    expect(getAccentLabel(accent!, 'en')).toBe('General American')
    expect(getAccentLabel(accent!, 'zh')).toBe('通用美式英语')
    expect(getAccentRegion(accent!, 'zh')).toBe('美国')
  })

  it('finds accents by stable keys and localized labels', () => {
    expect(findAccentByKeyOrName('british')?.key).toBe('british')
    expect(findAccentByKeyOrName('英式英语')?.key).toBe('british')
    expect(findAccentByKeyOrName('British English')?.key).toBe('british')
  })
})
