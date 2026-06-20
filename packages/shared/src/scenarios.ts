/**
 * Scenarios and accent profiles data and label functions.
 * 场景和口音数据与标签函数。
 */
import type { Locale, LocalizedText } from './locale'

export interface Scenario {
  key: string
  name: string
  description: string
  labels: LocalizedText
  descriptions: LocalizedText
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  icon: string
}

export interface AccentProfile {
  key: string
  name: string
  region: string
  description: string
  labels: LocalizedText
  regions: LocalizedText
  descriptions: LocalizedText
}

export const scenarios: Scenario[] = [
  {
    key: 'interview',
    name: 'Job Interview',
    description: 'Practice common interview questions and professional responses',
    labels: { en: 'Job Interview', zh: '工作面试' },
    descriptions: { en: 'Practice common interview questions and professional responses', zh: '练习常见面试问题和专业表达' },
    difficulty: 'beginner',
    icon: '💼',
  },
  {
    key: 'travel',
    name: 'Travel',
    description: 'Navigate airports, hotels, restaurants and local transport',
    labels: { en: 'Travel', zh: '旅行' },
    descriptions: { en: 'Navigate airports, hotels, restaurants and local transport', zh: '练习机场、酒店、餐厅和本地交通沟通' },
    difficulty: 'beginner',
    icon: '✈️',
  },
  {
    key: 'small-talk',
    name: 'Daily Small Talk',
    description: 'Casual conversations about weather, hobbies, and daily life',
    labels: { en: 'Daily Small Talk', zh: '日常闲聊' },
    descriptions: { en: 'Casual conversations about weather, hobbies, and daily life', zh: '围绕天气、爱好和日常生活进行轻松对话' },
    difficulty: 'beginner',
    icon: '☕',
  },
  {
    key: 'restaurant',
    name: 'Restaurant',
    description: 'Order food, make reservations, and handle dining situations',
    labels: { en: 'Restaurant', zh: '餐厅' },
    descriptions: { en: 'Order food, make reservations, and handle dining situations', zh: '练习点餐、预约和处理用餐场景' },
    difficulty: 'beginner',
    icon: '🍽️',
  },
  {
    key: 'workplace',
    name: 'Workplace',
    description: 'Meetings, emails, presentations and office communication',
    labels: { en: 'Workplace', zh: '职场' },
    descriptions: { en: 'Meetings, emails, presentations and office communication', zh: '练习会议、邮件、演示和办公室沟通' },
    difficulty: 'intermediate',
    icon: '🏢',
  },
]

export const accentProfiles: AccentProfile[] = [
  {
    key: 'british',
    name: 'British English',
    region: 'UK',
    description: 'RP and contemporary British',
    labels: { en: 'British English', zh: '英式英语' },
    regions: { en: 'UK', zh: '英国' },
    descriptions: { en: 'RP and contemporary British', zh: '标准英音和现代英式表达' },
  },
  {
    key: 'american',
    name: 'American English',
    region: 'US',
    description: 'Standard American accent',
    labels: { en: 'American English', zh: '美式英语' },
    regions: { en: 'US', zh: '美国' },
    descriptions: { en: 'Standard American accent', zh: '标准美式口音' },
  },
  {
    key: 'indian',
    name: 'Indian English',
    region: 'India',
    description: 'Indian English with regional influences',
    labels: { en: 'Indian English', zh: '印度英语' },
    regions: { en: 'India', zh: '印度' },
    descriptions: { en: 'Indian English with regional influences', zh: '带有地区特色的印度英语' },
  },
  {
    key: 'australian',
    name: 'Australian English',
    region: 'Australia',
    description: 'General Australian',
    labels: { en: 'Australian English', zh: '澳式英语' },
    regions: { en: 'Australia', zh: '澳大利亚' },
    descriptions: { en: 'General Australian', zh: '通用澳大利亚英语' },
  },
  {
    key: 'singapore',
    name: 'Singapore English',
    region: 'Singapore',
    description: 'Singaporean English variation',
    labels: { en: 'Singapore English', zh: '新加坡英语' },
    regions: { en: 'Singapore', zh: '新加坡' },
    descriptions: { en: 'Singaporean English variation', zh: '新加坡英语变体' },
  },
  {
    key: 'african',
    name: 'African English',
    region: 'Africa',
    description: 'Pan-African English influences',
    labels: { en: 'African English', zh: '非洲英语' },
    regions: { en: 'Africa', zh: '非洲' },
    descriptions: { en: 'Pan-African English influences', zh: '泛非洲英语特征' },
  },
]

/**
 * Picks a random accent profile using cryptographically secure randomness.
 * 使用加密安全随机数随机选择一个口音配置。
 */
export function pickRandomAccent(): AccentProfile {
  return accentProfiles[pickSecureRandomIndex(accentProfiles.length)] ?? accentProfiles[0]
}

function pickSecureRandomIndex(length: number) {
  if (length <= 1) return 0
  if (typeof globalThis.crypto?.getRandomValues !== 'function') return 0

  const maxUnbiasedValue = Math.floor(0x100000000 / length) * length
  const value = new Uint32Array(1)

  do {
    globalThis.crypto.getRandomValues(value)
  } while (value[0] >= maxUnbiasedValue)

  return value[0] % length
}

/**
 * Returns the localized label for a scenario, falling back to the English name.
 * 返回场景的本地化标签，若无本地化版本则回退到英文名称。
 */
export function getScenarioLabel(scenario: Scenario, locale: Locale) {
  return scenario.labels[locale] ?? scenario.name
}

/**
 * Returns the localized description for a scenario, falling back to the English description.
 * 返回场景的本地化描述，若无本地化版本则回退到英文描述。
 */
export function getScenarioDescription(scenario: Scenario, locale: Locale) {
  return scenario.descriptions[locale] ?? scenario.description
}

/**
 * Returns the localized label for an accent profile, falling back to the English name.
 * 返回口音的本地化标签，若无本地化版本则回退到英文名称。
 */
export function getAccentLabel(accent: AccentProfile, locale: Locale) {
  return accent.labels[locale] ?? accent.name
}

/**
 * Returns the localized region for an accent profile, falling back to the English region.
 * 返回口音的本地化地区，若无本地化版本则回退到英文地区名。
 */
export function getAccentRegion(accent: AccentProfile, locale: Locale) {
  return accent.regions[locale] ?? accent.region
}

/**
 * Returns the localized description for an accent profile, falling back to the English description.
 * 返回口音的本地化描述，若无本地化版本则回退到英文描述。
 */
export function getAccentDescription(accent: AccentProfile, locale: Locale) {
  return accent.descriptions[locale] ?? accent.description
}

/**
 * Returns the localized label for a difficulty level (beginner, intermediate, advanced).
 * 返回难度级别（初级、中级、高级）的本地化标签。
 */
export function getDifficultyLabel(difficulty: Scenario['difficulty'], locale: Locale) {
  const labels: Record<Scenario['difficulty'], LocalizedText> = {
    beginner: { en: 'Beginner', zh: '初级' },
    intermediate: { en: 'Intermediate', zh: '中级' },
    advanced: { en: 'Advanced', zh: '高级' },
  }
  return labels[difficulty][locale] ?? labels[difficulty].en
}

/**
 * Finds a scenario by its key, name, or any localized label (case-insensitive).
 * 通过 key、英文名称或任意本地化标签（不区分大小写）查找场景。
 */
export function findScenarioByKeyOrName(value: string) {
  const normalized = value.trim().toLowerCase()
  return scenarios.find(s =>
    s.key === normalized ||
    s.name.toLowerCase() === normalized ||
    Object.values(s.labels).some(label => label.toLowerCase() === normalized),
  )
}

/**
 * Finds an accent profile by its key, name, or any localized label (case-insensitive).
 * 通过 key、英文名称或任意本地化标签（不区分大小写）查找口音。
 */
export function findAccentByKeyOrName(value: string) {
  const normalized = value.trim().toLowerCase()
  return accentProfiles.find(a =>
    a.key === normalized ||
    a.name.toLowerCase() === normalized ||
    Object.values(a.labels).some(label => label.toLowerCase() === normalized),
  )
}
