import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import * as SecureStore from 'expo-secure-store'
import { themes, type ThemeKey, type ThemeColors } from './theme'

const THEME_KEY = 'app_theme'

const ThemeContext = createContext<{
  themeKey: ThemeKey
  C: ThemeColors
  setTheme: (k: ThemeKey) => void
}>({ themeKey: 'forest', C: themes.forest, setTheme: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeKey, setThemeKey] = useState<ThemeKey>('forest')

  useEffect(() => {
    SecureStore.getItemAsync(THEME_KEY).then(v => {
      if (v && v in themes) setThemeKey(v as ThemeKey)
    })
  }, [])

  function setTheme(k: ThemeKey) {
    setThemeKey(k)
    void SecureStore.setItemAsync(THEME_KEY, k)
  }

  return (
    <ThemeContext.Provider value={{ themeKey, C: themes[themeKey], setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
