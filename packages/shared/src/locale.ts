export type Locale = 'en' | 'zh'

export type LocalizedText = Record<Locale, string>

export function normalizeLocale(value?: string | null): Locale {
  return value === 'zh' ? 'zh' : 'en'
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
