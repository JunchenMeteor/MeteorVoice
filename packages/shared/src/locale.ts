export type Locale = 'en' | 'zh'

export type LocalizedText = Record<Locale, string>

export function normalizeLocale(value?: string | null): Locale {
  return value === 'zh' ? 'zh' : 'en'
}
