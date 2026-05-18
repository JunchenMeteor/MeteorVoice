export interface Scenario {
  key: string
  name: string
  nameZh: string
  description: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  icon: string
}

export interface AccentProfile {
  key: string
  name: string
  region: string
  description: string
}

export const scenarios: Scenario[] = [
  { key: 'interview',    name: 'Job Interview',    nameZh: '工作面试', description: 'Practice common interview questions and professional responses',            difficulty: 'beginner',    icon: '💼' },
  { key: 'travel',       name: 'Travel',           nameZh: '旅行',     description: 'Navigate airports, hotels, restaurants and local transport',              difficulty: 'beginner',    icon: '✈️' },
  { key: 'small-talk',   name: 'Daily Small Talk', nameZh: '日常闲聊',   description: 'Casual conversations about weather, hobbies, and daily life',             difficulty: 'beginner',    icon: '☕' },
  { key: 'restaurant',   name: 'Restaurant',       nameZh: '餐厅',     description: 'Order food, make reservations, and handle dining situations',            difficulty: 'beginner',    icon: '🍽️' },
  { key: 'workplace',    name: 'Workplace',        nameZh: '职场',     description: 'Meetings, emails, presentations and office communication',               difficulty: 'intermediate', icon: '🏢' },
]

export const accentProfiles: AccentProfile[] = [
  { key: 'british',    name: 'British English',    region: 'UK',        description: 'RP and contemporary British' },
  { key: 'american',   name: 'General American',   region: 'US',        description: 'Standard American accent' },
  { key: 'indian',     name: 'Indian English',     region: 'India',     description: 'Indian English with regional influences' },
  { key: 'australian', name: 'Australian English', region: 'Australia', description: 'General Australian' },
  { key: 'singapore',  name: 'Singapore English',  region: 'Singapore', description: 'Singaporean English variation' },
  { key: 'african',    name: 'African English',    region: 'Africa',    description: 'Pan-African English influences' },
]

export function pickRandomAccent(): AccentProfile {
  return accentProfiles[Math.floor(Math.random() * accentProfiles.length)]
}
