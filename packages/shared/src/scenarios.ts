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
    name: 'General American',
    region: 'US',
    description: 'Standard American accent',
    labels: { en: 'General American', zh: '通用美式英语' },
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

export function pickRandomAccent(): AccentProfile {
  return accentProfiles[Math.floor(Math.random() * accentProfiles.length)]
}

export function getScenarioLabel(scenario: Scenario, locale: Locale) {
  return scenario.labels[locale] ?? scenario.name
}

export function getScenarioDescription(scenario: Scenario, locale: Locale) {
  return scenario.descriptions[locale] ?? scenario.description
}

export function getAccentLabel(accent: AccentProfile, locale: Locale) {
  return accent.labels[locale] ?? accent.name
}

export function getAccentRegion(accent: AccentProfile, locale: Locale) {
  return accent.regions[locale] ?? accent.region
}

export function getAccentDescription(accent: AccentProfile, locale: Locale) {
  return accent.descriptions[locale] ?? accent.description
}

export function getDifficultyLabel(difficulty: Scenario['difficulty'], locale: Locale) {
  const labels: Record<Scenario['difficulty'], LocalizedText> = {
    beginner: { en: 'Beginner', zh: '初级' },
    intermediate: { en: 'Intermediate', zh: '中级' },
    advanced: { en: 'Advanced', zh: '高级' },
  }
  return labels[difficulty][locale] ?? labels[difficulty].en
}

export function findScenarioByKeyOrName(value: string) {
  const normalized = value.trim().toLowerCase()
  return scenarios.find(s =>
    s.key === normalized ||
    s.name.toLowerCase() === normalized ||
    Object.values(s.labels).some(label => label.toLowerCase() === normalized),
  )
}

export function findAccentByKeyOrName(value: string) {
  const normalized = value.trim().toLowerCase()
  return accentProfiles.find(a =>
    a.key === normalized ||
    a.name.toLowerCase() === normalized ||
    Object.values(a.labels).some(label => label.toLowerCase() === normalized),
  )
}
