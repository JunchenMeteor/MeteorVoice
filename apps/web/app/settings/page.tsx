'use client'

import { useTheme, themes } from '@/components/ThemeProvider'
import { useLocale, useT } from '@/components/LanguageProvider'
import { accentProfiles, getAccentLabel } from '@/lib/scenarios'
import { supportsAccent } from '@/lib/providers/tts-capabilities'
import { persistPreference, persistTTSSpeedPreference, readTTSSpeedPreference, ttsSpeedOptions, writeTTSSpeedPreference, type TTSSpeed } from '@/lib/tts-speed'
import type { Locale } from '@meteorvoice/shared'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { useEffect, useState } from 'react'

type XunfeiConfiguredVoice = {
  id: string
  name: string
  language: 'en' | 'zh'
  gender: 'male' | 'female'
  tier: 'trial' | 'base'
  expiresAt?: string
  envKey: string
  usage: string
  status: 'active' | 'expired'
}

const allTtsProviders = [
  { key: 'mock', labelKey: 'settings.tts_provider_mock' },
  { key: 'xunfei', labelKey: 'settings.tts_provider_xunfei' },
  { key: 'volcengine', labelKey: 'settings.tts_provider_volcengine' },
  { key: 'tencent', labelKey: 'settings.tts_provider_tencent' },
] as const

function formatTtsSpeed(speed: number) {
  return `${speed.toFixed(2).replace(/0$/, '')}x`
}

function formatDateTime(value?: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value))
}

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
  const [xunfeiVoices, setXunfeiVoices] = useState<XunfeiConfiguredVoice[]>([])

  useEffect(() => {
    async function loadTtsProvider() {
      try {
        const res = await fetch('/api/preferences')
        const data = await res.json() as {
          tts_provider?: string
          available_providers?: string[]
          tts_speed?: number
          xunfei_voices?: { configured?: XunfeiConfiguredVoice[] }
        }
        if (data.tts_provider) setTtsProvider(data.tts_provider)
        if (data.available_providers) setAvailableProviders(data.available_providers)
        if (data.xunfei_voices?.configured) setXunfeiVoices(data.xunfei_voices.configured)
        if (typeof data.tts_speed === 'number') {
          const serverSpeed = data.tts_speed
          const nextSpeed = ttsSpeedOptions.reduce((best, option) =>
            Math.abs(option - serverSpeed) < Math.abs(best - serverSpeed) ? option : best,
          ttsSpeedOptions[2])
          setTtsSpeed(nextSpeed)
          writeTTSSpeedPreference(nextSpeed)
        }
      } catch {}
    }

    void loadTtsProvider()
  }, [])

  function handleAccentChange(key: string) {
    if (!supportsAccent(ttsProvider, key)) return
    setDefaultAccent(key)
    localStorage.setItem('coach-default-accent', key)
    void persistPreference('default_accent_key', key)
  }

  function handleTtsProviderChange(key: string) {
    setTtsProvider(key)
    if (!supportsAccent(key, defaultAccent)) {
      setDefaultAccent('american')
      localStorage.setItem('coach-default-accent', 'american')
      void persistPreference('default_accent_key', 'american')
    }
    void persistPreference('tts_provider', key)
  }

  function handleTtsSpeedChange(index: number) {
    const next = ttsSpeedOptions[index] ?? 1
    setTtsSpeed(next)
    void persistTTSSpeedPreference(next)
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
                {t(th.labelKey)}
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
          {ttsProvider === 'xunfei' && (
            <div className="mt-4 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--theme-text-primary)]">
                  {t('settings.xunfei_voice_config')}
                </p>
                <span className={`status-badge ${availableProviders.includes('xunfei') ? 'success' : 'warning'}`}>
                  {availableProviders.includes('xunfei') ? t('settings.xunfei_voice_available') : t('settings.xunfei_voice_unavailable')}
                </span>
              </div>
              {xunfeiVoices.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {xunfeiVoices.map(voice => (
                    <div
                      key={`${voice.envKey}-${voice.id}`}
                      className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-[var(--theme-text-primary)]">{voice.name}</span>
                        <span className="text-xs text-[var(--theme-text-muted)]">{voice.id}</span>
                        <span className={`status-badge ${voice.status === 'active' ? 'success' : 'warning'}`}>
                          {voice.status === 'active' ? t('settings.xunfei_voice_active') : t('settings.xunfei_voice_expired')}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--theme-text-muted)]">
                        {voice.envKey} · {voice.usage} · {t(`settings.xunfei_voice_language_${voice.language}`)} · {t(`settings.xunfei_voice_gender_${voice.gender}`)} · {t(`settings.xunfei_voice_tier_${voice.tier}`)}
                      </p>
                      {voice.expiresAt && (
                        <p className="mt-1 text-xs text-[var(--theme-text-muted)]">
                          {t('settings.xunfei_voice_expires').replace('{date}', formatDateTime(voice.expiresAt))}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-[var(--theme-text-muted)]">
                  {t('settings.xunfei_voice_empty')}
                </p>
              )}
              <p className="mt-3 text-xs text-[var(--theme-text-muted)]">
                {t('settings.xunfei_voice_billing_hint')}
              </p>
            </div>
          )}
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
              <span className="status-badge success">{formatTtsSpeed(ttsSpeed)}</span>
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
            <div className="flex justify-between text-xs text-[var(--theme-text-muted)]">
              {ttsSpeedOptions.map(speed => (
                <span key={speed} className="min-w-0 text-center first:text-left last:text-right">
                  {speed === 1 ? t('settings.tts_speed_normal') : formatTtsSpeed(speed)}
                </span>
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
