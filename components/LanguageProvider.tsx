'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Locale } from '@/lib/i18n'
import { t } from '@/lib/i18n'

const LangContext = createContext<{
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string) => string
}>({ locale: 'en', setLocale: () => {}, t: (k: string) => k })

export function useLocale() { return useContext(LangContext) }
export function useT() { return useContext(LangContext).t }

export default function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')

  useEffect(() => {
    const stored = localStorage.getItem('coach-locale') as Locale | null
    if (stored === 'en' || stored === 'zh') {
      setLocaleState(stored)
    }
  }, [])

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
