/**
 * Locale normalization utility.
 * 语言环境规范化工具。
 */
export type Locale = 'en' | 'zh'

export type LocalizedText = Record<Locale, string>

/**
 * Normalizes a raw locale string to a valid Locale value (en or zh).
 * 将原始语言环境字符串规范化为有效的 Locale 值（en 或 zh）。
 */
export function normalizeLocale(value?: string | null): Locale {
  return value === 'zh' ? 'zh' : 'en'
}
