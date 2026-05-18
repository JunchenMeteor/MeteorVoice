'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const themes = [
  { key: 'default-calm',  label: 'Default Calm' },
  { key: 'conversation',  label: 'Conversation' },
  { key: 'night',         label: 'Night' },
  { key: 'learning',      label: 'Learning' },
  { key: 'bright',        label: 'Bright' },
  { key: 'playful',       label: 'Playful' },
]

type ThemeKey = typeof themes[number]['key']

const ThemeContext = createContext<{
  theme: ThemeKey
  themes: typeof themes
  setTheme: (t: ThemeKey) => void
}>({ theme: 'default-calm', themes, setTheme: () => {} })

export function useTheme() { return useContext(ThemeContext) }

export default function ThemeProvider({ children, initial }: { children: ReactNode; initial?: string }) {
  const [theme, setThemeState] = useState<ThemeKey>('default-calm')

  useEffect(() => {
    const stored = localStorage.getItem('coach-theme') as ThemeKey | null
    const t = stored ?? (initial as ThemeKey) ?? 'default-calm'
    setThemeState(t)
    applyTheme(t)
  }, [initial])

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
