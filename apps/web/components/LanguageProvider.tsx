/**
 * Locale context provider for internationalization.
 * 国际化语言上下文提供者。
 */

'use client'

import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { Locale } from '@meteorvoice/shared'
import { t } from '@meteorvoice/shared'

const LangContext = createContext<{
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string) => string
}>({ locale: 'en', setLocale: () => {}, t: (k: string) => k })

/** 获取当前语言的 React Hook */
export function useLocale() { return useContext(LangContext) }
/** 获取翻译函数的 React Hook */
export function useT() { return useContext(LangContext).t }

function initialLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  const stored = localStorage.getItem('coach-locale') as Locale | null
  return stored === 'en' || stored === 'zh' ? stored : 'en'
}

export default function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  function setLocale(l: Locale) {
    setLocaleState(l)
    localStorage.setItem('coach-locale', l)
  }

  function translate(key: string): string {
    return t[locale]?.[key] ?? t['en']?.[key] ?? key
  }

  return (
    <LangContext.Provider value={{ locale, setLocale, t: translate }}>
      {children}
    </LangContext.Provider>
  )
}
