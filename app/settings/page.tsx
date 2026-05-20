'use client'

import { useTheme, themes } from '@/components/ThemeProvider'
import { useLocale, useT } from '@/components/LanguageProvider'
import { accentProfiles, getAccentLabel } from '@/lib/scenarios'
import { supportsAccent } from '@/lib/providers/tts-capabilities'
import { readTTSSpeedPreference, ttsSpeedOptions, writeTTSSpeedPreference, type TTSSpeed } from '@/lib/tts-speed'
import type { Locale } from '@/lib/i18n'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { useEffect, useState } from 'react'

const allTtsProviders = [
  { key: 'mock', labelKey: 'settings.tts_provider_mock' },
  { key: 'xunfei', labelKey: 'settings.tts_provider_xunfei' },
  { key: 'volcengine', labelKey: 'settings.tts_provider_volcengine' },
  { key: 'tencent', labelKey: 'settings.tts_provider_tencent' },
] as const

function initialDefaultAccent() {
  if (typeof window === 'undefined') return 'american'
  return localStorage.getItem('coach-default-accent') ?? 'american'
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { locale, setLocale } = useLocale()
  const t = useT()
  const [defaultAccent, setDefaultAccent] = useState(initialDefaultAccent)
  const [ttsProvider, setTtsProvider] = useState('mock')
  const [ttsSpeed, setTtsSpeed] = useState<TTSSpeed>(readTTSSpeedPreference)
  const [availableProviders, setAvailableProviders] = useState<string[]>(['mock'])

  useEffect(() => {
    async function loadTtsProvider() {
      try {
        const res = await fetch('/api/preferences')
        const data = await res.json() as { tts_provider?: string; available_providers?: string[] }
        if (data.tts_provider) setTtsProvider(data.tts_provider)
        if (data.available_providers) setAvailableProviders(data.available_providers)
      } catch {}
    }

    void loadTtsProvider()
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

  function handleTtsSpeedChange(index: number) {
    const next = ttsSpeedOptions[index] ?? 1
    setTtsSpeed(next)
    writeTTSSpeedPreference(next)
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
                title={enabled ? getAccentLabel(a, locale) : t('settings.accent_not_supported')}
                className={`chip-action ${a.key === defaultAccent ? 'is-active' : ''} ${enabled ? '' : 'opacity-40 cursor-not-allowed'}`}
              >
                {getAccentLabel(a, locale)}
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
            {allTtsProviders.map(provider => {
              const isAvailable = availableProviders.includes(provider.key)
              return (
              <button
                key={provider.key}
                type="button"
                onClick={() => isAvailable && handleTtsProviderChange(provider.key)}
                disabled={!isAvailable}
                title={isAvailable ? undefined : t('settings.tts_not_configured')}
                className={`chip-action ${provider.key === ttsProvider ? 'is-active' : ''} ${!isAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {t(provider.labelKey)}
              </button>
              )
            })}
          </div>
          <p className="text-xs text-[var(--theme-text-muted)] mt-3">
            {t('settings.tts_provider_hint')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.tts_speed')}</CardTitle>
          <CardDescription>{t('settings.tts_speed_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm font-medium text-[var(--theme-text-primary)]">
              <span>{t('settings.tts_speed_slow')}</span>
              <span className="status-badge success">{ttsSpeed.toFixed(2).replace(/0$/, '')}x</span>
              <span>{t('settings.tts_speed_fast')}</span>
            </div>
            <input
              type="range"
              min={0}
              max={ttsSpeedOptions.length - 1}
              step={1}
              value={ttsSpeedOptions.indexOf(ttsSpeed)}
              onChange={event => handleTtsSpeedChange(Number(event.target.value))}
              className="w-full accent-[var(--theme-accent)]"
              aria-label={t('settings.tts_speed')}
            />
            <div className="grid grid-cols-5 text-center text-xs text-[var(--theme-text-muted)]">
              {ttsSpeedOptions.map(speed => (
                <span key={speed}>{speed === 1 ? t('settings.tts_speed_normal') : `${speed}x`}</span>
              ))}
            </div>
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
