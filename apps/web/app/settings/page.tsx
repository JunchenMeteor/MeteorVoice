'use client'

/**
 * Settings page.
 * 设置页面。
 */

import { useCallback, useEffect, useState } from 'react'

import { displayErrorFeedback, hideAppFeedback, runAppOperationGroup } from '@meteorvoice/shared'
import type { Locale, VoiceProfile } from '@meteorvoice/shared'
import { formatApiRequestError, readApiJsonResponse } from '@meteorvoice/api-client'

import { useTheme, themes } from '@/components/ThemeProvider'
import { useLocale, useT } from '@/components/LanguageProvider'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { readTTSSpeedPreference, ttsSpeedOptions, writeTTSSpeedPreference } from '@/lib/tts-speed'
import type { TTSSpeed } from '@/lib/tts-speed'
import { writeTTSVoiceIdPreference } from '@/lib/tts-voice'

const allTtsProviders = [
  { key: 'mock', labelKey: 'settings.tts_provider_mock' },
  { key: 'xunfei', labelKey: 'settings.tts_provider_xunfei' },
  { key: 'volcengine', labelKey: 'settings.tts_provider_volcengine' },
  { key: 'tencent', labelKey: 'settings.tts_provider_tencent' },
  { key: 'azure', labelKey: 'settings.tts_provider_azure' },
] as const

function formatTtsSpeed(speed: number) {
  return `${speed.toFixed(2).replace(/0$/, '')}x`
}

function formatVoiceProfileMeta(profile: VoiceProfile, t: (key: string) => string) {
  const parts = [
    t(`settings.tts_provider_${profile.provider}`) !== `settings.tts_provider_${profile.provider}`
      ? t(`settings.tts_provider_${profile.provider}`)
      : profile.provider,
    profile.locale === 'zh' ? t('settings.xunfei_voice_language_zh') : t('settings.xunfei_voice_language_en'),
    profile.gender ? t(`settings.xunfei_voice_gender_${profile.gender}`) : null,
    profile.qualityTier ? t(`settings.xunfei_voice_tier_${profile.qualityTier}`) : null,
    profile.accentLabel ?? null,
    profile.accentRegion ?? null,
    profile.style ?? null,
  ].filter(Boolean)
  return parts.join(' · ')
}

function getVoiceProfileName(profile: VoiceProfile, locale: Locale) {
  return locale === 'zh' ? profile.displayNameZh ?? profile.displayName : profile.displayName
}

type PreferencesPayload = {
  tts_provider?: string
  available_providers?: string[]
  locale?: Locale
  tts_speed?: number
  tts_voice_id?: string | null
  voice_profiles?: VoiceProfile[]
  selected_voice_profile_id?: string | null
}

const settingsFeedbackSource = 'web_settings'
const settingsErrorFeedbackSource = 'web_settings_error'

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { locale, setLocale } = useLocale()
  const t = useT()
  const [ttsProvider, setTtsProvider] = useState('mock')
  const [ttsSpeed, setTtsSpeed] = useState<TTSSpeed>(readTTSSpeedPreference)
  const [ttsVoiceId, setTtsVoiceId] = useState<string | null>(null)
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([])
  const [selectedVoiceProfileId, setSelectedVoiceProfileId] = useState<string | null>(null)
  const [availableProviders, setAvailableProviders] = useState<string[]>(['mock'])
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const settingsSyncingMessage = t('settings.syncing')

  const applyPreferences = useCallback((data: PreferencesPayload) => {
    setSettingsError(null)
    if (data.locale) setLocale(data.locale)
    if (data.tts_provider) setTtsProvider(data.tts_provider)
    if (data.available_providers) setAvailableProviders(data.available_providers)
    if (data.voice_profiles) setVoiceProfiles(data.voice_profiles)
    if ('selected_voice_profile_id' in data) setSelectedVoiceProfileId(data.selected_voice_profile_id ?? null)
    if ('tts_voice_id' in data) {
      setTtsVoiceId(data.tts_voice_id ?? null)
      writeTTSVoiceIdPreference(data.tts_voice_id ?? null)
    }
    if (typeof data.tts_speed === 'number') {
      const serverSpeed = data.tts_speed
      const nextSpeed = ttsSpeedOptions.reduce((best, option) =>
        Math.abs(option - serverSpeed) < Math.abs(best - serverSpeed) ? option : best,
      ttsSpeedOptions[2])
      setTtsSpeed(nextSpeed)
      writeTTSSpeedPreference(nextSpeed)
    }
  }, [setLocale])

  const applyPreferenceUpdate = useCallback((data: PreferencesPayload, body: Record<string, unknown>) => {
    setSettingsError(null)
    if ('locale' in body && data.locale) setLocale(data.locale)
    if ('tts_provider' in body && data.tts_provider) setTtsProvider(data.tts_provider)
    if ('tts_speed' in body && typeof data.tts_speed === 'number') {
      const serverSpeed = data.tts_speed
      const nextSpeed = ttsSpeedOptions.reduce((best, option) =>
        Math.abs(option - serverSpeed) < Math.abs(best - serverSpeed) ? option : best,
      ttsSpeedOptions[2])
      setTtsSpeed(nextSpeed)
      writeTTSSpeedPreference(nextSpeed)
    }
    if ('selected_voice_profile_id' in body || 'tts_provider' in body) {
      if ('selected_voice_profile_id' in data) setSelectedVoiceProfileId(data.selected_voice_profile_id ?? null)
      if ('tts_voice_id' in data) {
        setTtsVoiceId(data.tts_voice_id ?? null)
        writeTTSVoiceIdPreference(data.tts_voice_id ?? null)
      }
      const profile = voiceProfiles.find(item => item.id === data.selected_voice_profile_id)
      if (profile?.provider) setTtsProvider(profile.provider)
    }
  }, [setLocale, voiceProfiles])

  const fetchPreferences = useCallback(async () => {
    const res = await fetch('/api/preferences', {
      headers: { 'X-MeteorVoice-Client': 'meteorvoice-web' },
    })
    return readApiJsonResponse<PreferencesPayload>(res, 'Preferences request failed')
  }, [])

  useEffect(() => {
    async function loadInitialPreferences() {
      const results = await runAppOperationGroup({
        source: settingsFeedbackSource,
        tasks: {
          preferences: fetchPreferences,
        },
      })
      if (results.preferences.status === 'fulfilled') {
        applyPreferences(results.preferences.value)
        return
      }
      const requestError = formatApiRequestError(results.preferences.reason, {
        context: 'web_settings_preferences_load',
        presentation: 'inline',
      })
      setSettingsError(requestError.displayMessage)
    }

    void loadInitialPreferences()
  }, [applyPreferences, fetchPreferences])

  useEffect(() => () => {
    hideAppFeedback(settingsFeedbackSource)
  }, [])

  async function savePreferences(body: Record<string, unknown>, context: string) {
    if (settingsLoading) return
    setSettingsLoading(true)
    setSettingsError(null)
    const results = await runAppOperationGroup({
      source: settingsFeedbackSource,
      feedback: {
        message: settingsSyncingMessage,
        variant: 'hud',
        blocksInteraction: true,
      },
      tasks: {
        preferences: async () => {
          const res = await fetch('/api/preferences', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-MeteorVoice-Client': 'meteorvoice-web' },
            body: JSON.stringify(body),
          })
          return readApiJsonResponse<PreferencesPayload>(res, 'Preferences update failed')
        },
      },
    })
    if (results.preferences.status === 'fulfilled') {
      applyPreferenceUpdate(results.preferences.value, body)
      setSettingsLoading(false)
      return
    }
    try {
      throw results.preferences.reason
    } catch (error) {
      const requestError = formatApiRequestError(error, {
        context,
        presentation: 'banner',
      })
      setSettingsError(requestError.displayMessage)
      displayErrorFeedback(requestError, settingsErrorFeedbackSource)
    } finally {
      setSettingsLoading(false)
    }
  }

  function handleTtsProviderChange(key: string) {
    const nextProfile = voiceProfiles.find(profile => profile.provider === key && profile.status === 'active')
    void savePreferences({
      tts_provider: key,
      ...(nextProfile ? { selected_voice_profile_id: nextProfile.id } : {}),
    }, 'web_settings_tts_provider_save')
  }

  function handleTtsSpeedChange(index: number) {
    const next = ttsSpeedOptions[index] ?? 1
    void savePreferences({ tts_speed: next }, 'web_settings_tts_speed_save')
  }

  function handleVoiceProfileChange(profile: VoiceProfile) {
    if (profile.status !== 'active') return
    void savePreferences({ selected_voice_profile_id: profile.id }, 'web_settings_voice_profile_save')
  }

  function handleLocaleChange(nextLocale: Locale) {
    if (nextLocale === locale) return
    setLocale(nextLocale)
    void savePreferences({ locale: nextLocale }, 'web_settings_locale_save')
  }

  const providerVoiceProfiles = voiceProfiles.filter(profile => profile.provider === ttsProvider)
  const selectedVoiceProfile = voiceProfiles.find(profile => profile.id === selectedVoiceProfileId)
    ?? providerVoiceProfiles.find(profile => profile.providerVoiceId === ttsVoiceId)
    ?? providerVoiceProfiles.find(profile => profile.status === 'active')

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--theme-text-primary)]">{t('settings.title')}</h1>
        <p className="text-sm text-[var(--theme-text-secondary)] mt-1">
          {t('settings.subtitle')}
        </p>
      </div>
      {settingsError && (
        <div className="rounded-md border border-[var(--theme-danger)] bg-[var(--theme-surface-muted)] px-3 py-2 text-sm text-[var(--theme-danger)]">
          {settingsError}
        </div>
      )}

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
                disabled={settingsLoading}
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
                onClick={() => handleLocaleChange(l.key)}
                disabled={settingsLoading}
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
                disabled={settingsLoading || !isAvailable}
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
          <div className="mt-4 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-[var(--theme-text-primary)]">
                {t('settings.voice_profile_current')}
              </p>
              {selectedVoiceProfile && (
                <span className={`status-badge ${selectedVoiceProfile.status === 'active' ? 'success' : 'warning'}`}>
                  {selectedVoiceProfile.status === 'active' ? t('settings.xunfei_voice_active') : t('settings.voice_profile_unavailable')}
                </span>
              )}
            </div>
            {selectedVoiceProfile ? (
              <div className="mt-3 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2">
                <p className="text-sm font-medium text-[var(--theme-text-primary)]">{getVoiceProfileName(selectedVoiceProfile, locale)}</p>
                <p className="mt-1 text-xs text-[var(--theme-text-muted)]">
                  {formatVoiceProfileMeta(selectedVoiceProfile, t)}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-[var(--theme-text-muted)]">
                {t('settings.voice_profile_empty')}
              </p>
            )}
            {providerVoiceProfiles.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-[var(--theme-text-primary)]">
                  {t('settings.voice_profile_select')}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {providerVoiceProfiles.map(profile => {
                    const unavailable = profile.status !== 'active'
                    return (
                      <button
                        key={profile.id}
                        type="button"
                        disabled={settingsLoading || unavailable}
                        onClick={() => handleVoiceProfileChange(profile)}
                        className={`chip-action min-h-[72px] flex-col items-start justify-start text-left ${selectedVoiceProfile?.id === profile.id ? 'is-active' : ''} ${unavailable ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <span className="text-sm font-medium">{getVoiceProfileName(profile, locale)}</span>
                        <span className="text-xs text-[var(--theme-text-muted)]">
                          {formatVoiceProfileMeta(profile, t)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
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
              disabled={settingsLoading}
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
