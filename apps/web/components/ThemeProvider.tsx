'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const themes = [
  { key: 'default-calm', labelKey: 'settings.theme_default_calm' },
  { key: 'conversation', labelKey: 'settings.theme_conversation' },
  { key: 'night', labelKey: 'settings.theme_night' },
  { key: 'learning', labelKey: 'settings.theme_learning' },
  { key: 'bright', labelKey: 'settings.theme_bright' },
  { key: 'playful', labelKey: 'settings.theme_playful' },
]

type ThemeKey = typeof themes[number]['key']

const ThemeContext = createContext<{
  theme: ThemeKey
  themes: typeof themes
  setTheme: (t: ThemeKey) => void
}>({ theme: 'default-calm', themes, setTheme: () => {} })

export function useTheme() { return useContext(ThemeContext) }

function isThemeKey(value: string | null | undefined): value is ThemeKey {
  return themes.some(theme => theme.key === value)
}

function initialTheme(initial?: string): ThemeKey {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('coach-theme')
    if (isThemeKey(stored)) return stored
  }
  return isThemeKey(initial) ? initial : 'default-calm'
}

export default function ThemeProvider({ children, initial }: { children: ReactNode; initial?: string }) {
  const [theme, setThemeState] = useState<ThemeKey>(() => initialTheme(initial))

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  function setTheme(t: ThemeKey) {
    setThemeState(t)
    applyTheme(t)
    localStorage.setItem('coach-theme', t)
  }

  return (
    <ThemeContext.Provider value={{ theme, themes, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

function applyTheme(key: ThemeKey) {
  if (key === 'default-calm') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', key)
  }
}

export { themes }
