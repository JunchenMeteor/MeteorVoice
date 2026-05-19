'use client'

import { useTheme, themes } from '@/components/ThemeProvider'
import { useLocale, useT } from '@/components/LanguageProvider'
import { accentProfiles } from '@/lib/scenarios'
import { supportsAccent } from '@/lib/providers/tts-capabilities'
import type { Locale } from '@/lib/i18n'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { useEffect, useState } from 'react'

const ttsProviders = [
  { key: 'mock', labelKey: 'settings.tts_provider_mock' },
  { key: 'xunfei', labelKey: 'settings.tts_provider_xunfei' },
  { key: 'volcengine', labelKey: 'settings.tts_provider_volcengine' },
  { key: 'tencent', labelKey: 'settings.tts_provider_tencent' },
] as const

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { locale, setLocale } = useLocale()
  const t = useT()
  const [defaultAccent, setDefaultAccent] = useState('american')
  const [ttsProvider, setTtsProvider] = useState('mock')

  useEffect(() => {
    const stored = localStorage.getItem('coach-default-accent')
    if (stored) setDefaultAccent(stored)
    loadTtsProvider()
  }, [])

  function handleAccentChange(key: string) {
    if (!supportsAccent(ttsProvider, key)) return
    setDefaultAccent(key)
    localStorage.setItem('coach-default-accent', key)
  }

  function handleTtsProviderChange(key: string) {
    setTtsProvider(key)
    if (!supportsAccent(key, defaultAccent)) {
      setDefaultAccent('american')
      localStorage.setItem('coach-default-accent', 'american')
    }
    fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tts_provider: key }),
    }).catch(() => {})
  }

  async function loadTtsProvider() {
    try {
      const res = await fetch('/api/preferences')
      const data = await res.json() as { tts_provider?: string }
      if (data.tts_provider) setTtsProvider(data.tts_provider)
    } catch {}
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
            {accentProfiles.map(a => {
              const enabled = supportsAccent(ttsProvider, a.key)
              return (
              <button
                key={a.key}
                type="button"
                onClick={() => handleAccentChange(a.key)}
                disabled={!enabled}
                title={enabled ? a.name : t('settings.accent_not_supported')}
                className={`chip-action ${a.key === defaultAccent ? 'is-active' : ''} ${enabled ? '' : 'opacity-40 cursor-not-allowed'}`}
              >
                {a.name}
              </button>
              )
            })}
          </div>
          <p className="text-xs text-[var(--theme-text-muted)] mt-3">
            {t('settings.accent_provider_hint')}
          </p>
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
          <CardTitle>{t('settings.tts_provider')}</CardTitle>
          <CardDescription>{t('settings.tts_provider_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {ttsProviders.map(provider => (
              <button
                key={provider.key}
                type="button"
                onClick={() => handleTtsProviderChange(provider.key)}
                className={`chip-action ${provider.key === ttsProvider ? 'is-active' : ''}`}
              >
                {t(provider.labelKey)}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--theme-text-muted)] mt-3">
            {t('settings.tts_provider_hint')}
          </p>
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
