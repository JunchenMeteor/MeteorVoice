'use client'

import { useTheme, themes } from '@/components/ThemeProvider'
import { useLocale, useT } from '@/components/LanguageProvider'
import { accentProfiles } from '@/lib/scenarios'
import type { Locale } from '@/lib/i18n'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { useEffect, useState } from 'react'

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { locale, setLocale } = useLocale()
  const t = useT()
  const [defaultAccent, setDefaultAccent] = useState('american')

  useEffect(() => {
    const stored = localStorage.getItem('coach-default-accent')
    if (stored) setDefaultAccent(stored)
  }, [])

  function handleAccentChange(key: string) {
    setDefaultAccent(key)
    localStorage.setItem('coach-default-accent', key)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--theme-text-primary)]">{t('settings.title')}</h1>
        <p className="text-sm text-[var(--theme-text-secondary)] mt-1">
          {t('settings.subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.theme')}</CardTitle>
          <CardDescription>{t('settings.theme_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {themes.map(th => (
              <button
                key={th.key}
                type="button"
                onClick={() => setTheme(th.key)}
                className={`chip-action ${th.key === theme ? 'is-active' : ''}`}
              >
                {th.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.language')}</CardTitle>
          <CardDescription>{t('settings.language_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {([
              { key: 'en', label: 'English' },
              { key: 'zh', label: '中文' },
            ] as { key: Locale; label: string }[]).map(l => (
              <button
                key={l.key}
                type="button"
                onClick={() => setLocale(l.key)}
                className={`chip-action ${l.key === locale ? 'is-active' : ''}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.default_accent')}</CardTitle>
          <CardDescription>{t('settings.default_accent_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {accentProfiles.map(a => (
              <button
                key={a.key}
                type="button"
                onClick={() => handleAccentChange(a.key)}
                className={`chip-action ${a.key === defaultAccent ? 'is-active' : ''}`}
              >
                {a.name}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.ai_provider')}</CardTitle>
          <CardDescription>{t('settings.ai_mode')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--theme-text-secondary)]">{t('settings.ai_mode')}</span>
              <span className="chip-action is-active">DeepSeek</span>
            </div>
            <p className="text-xs text-[var(--theme-text-muted)]">
              {t('settings.ai_hint')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.about')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--theme-text-secondary)]">
            {t('settings.about_text')}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
