import { useMemo } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTheme } from '../ThemeProvider'
import type { Locale, VoiceProfile } from '@meteorvoice/shared'
import type { MobileAuthState } from '../mobileAuth'
import type { XunfeiVoice } from '../mobilePreferences'
import { themeLabels, type ThemeKey } from '../theme'

interface Props {
  tr: (key: string) => string
  locale: Locale
  ttsProvider: string
  availableProviders: string[]
  sessionSttProvider: 'native' | 'xunfei'
  availableSessionSttProviders: Array<'native' | 'xunfei'>
  ttsSpeed: number
  ttsVoiceId: string | null
  voiceProfiles: VoiceProfile[]
  selectedVoiceProfileId: string | null
  xunfeiVoices: XunfeiVoice[]
  settingsLoading: boolean
  authSubmitting: boolean
  settingsMessage: string | null
  auth: MobileAuthState
  email: string
  password: string
  authMode: 'sign-in' | 'sign-up'
  apiBaseUrl: string
  apiBaseUrlSource: 'default' | 'user'
  defaultApiBaseUrl: string
  appVersion: string
  voiceMetricsText: string
  asrEvaluationText: string
  onSetLocale: (l: string) => void
  onSetTheme: (k: ThemeKey) => void
  onSaveProvider: (p: string) => void
  onSetSessionSttProvider: (p: 'native' | 'xunfei') => void
  onAdjustSpeed: (delta: number) => void
  onSavePracticePreferences: () => void
  onLoadPreferences: () => void
  onSelectVoiceProfile: (profile: VoiceProfile) => void
  onSetEmail: (v: string) => void
  onSetPassword: (v: string) => void
  onSetAuthMode: (m: 'sign-in' | 'sign-up') => void
  onSubmitAuth: () => void
  onSignOut: () => void
  onSetApiBaseUrl: (v: string) => void
  onResetApiBaseUrl: () => void
  onClearVoiceMetrics: () => void
  onShareVoiceMetrics: () => void
  onShareASREvaluation: () => void
}

export function SettingsScreen({
  tr, locale, ttsProvider, availableProviders, sessionSttProvider, availableSessionSttProviders, ttsSpeed,
  ttsVoiceId, voiceProfiles, selectedVoiceProfileId, xunfeiVoices,
  settingsLoading, authSubmitting, settingsMessage,
  auth, email, password, authMode, apiBaseUrl, apiBaseUrlSource, defaultApiBaseUrl, appVersion, voiceMetricsText, asrEvaluationText,
  onSetLocale, onSetTheme, onSaveProvider, onSetSessionSttProvider, onAdjustSpeed, onSavePracticePreferences,
  onLoadPreferences, onSelectVoiceProfile,
  onSetEmail, onSetPassword, onSetAuthMode, onSubmitAuth, onSignOut, onSetApiBaseUrl,
  onResetApiBaseUrl, onClearVoiceMetrics, onShareVoiceMetrics, onShareASREvaluation,
}: Props) {
  const { C, themeKey } = useTheme()
  const speedFill = Math.max(0, Math.min(1, (ttsSpeed - 0.7) / 0.6))
  const providerVoiceProfiles = voiceProfiles.filter(profile => profile.provider === ttsProvider)
  const selectedVoiceProfile = voiceProfiles.find(profile => profile.id === selectedVoiceProfileId)
    ?? providerVoiceProfiles.find(profile => profile.providerVoiceId === ttsVoiceId)
    ?? providerVoiceProfiles.find(profile => profile.status === 'active')

  function voiceProfileMeta(profile: VoiceProfile) {
    const providerLabel = tr(`settings.tts_provider_${profile.provider}`) !== `settings.tts_provider_${profile.provider}`
      ? tr(`settings.tts_provider_${profile.provider}`)
      : profile.provider
    const gender = profile.gender ? tr(`settings.xunfei_voice_gender_${profile.gender}`) : null
    const language = profile.locale === 'zh' ? tr('settings.xunfei_voice_language_zh') : tr('settings.xunfei_voice_language_en')
    const tier = profile.qualityTier ? tr(`settings.xunfei_voice_tier_${profile.qualityTier}`) : null
    return [providerLabel, language, gender, tier, profile.accentLabel, profile.accentRegion, profile.style].filter(Boolean).join(' · ')
  }

  function voiceProfileName(profile: VoiceProfile) {
    return locale === 'zh' ? profile.displayNameZh ?? profile.displayName : profile.displayName
  }

  const styles = useMemo(() => StyleSheet.create({
    shell: { flex: 1, backgroundColor: C.bg },
    scrollView: { flex: 1 },
    content: { paddingHorizontal: 16, gap: 14 },
    title: { color: C.textPrimary, fontSize: 22, fontWeight: '800' },
    card: {
      backgroundColor: C.surface, borderRadius: 12,
      borderWidth: 1, borderColor: C.border, padding: 14, gap: 10,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { color: C.textPrimary, fontSize: 14, fontWeight: '700' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      backgroundColor: C.bg, borderRadius: 8, borderWidth: 1,
      borderColor: C.border, paddingHorizontal: 12, paddingVertical: 8,
    },
    chipActive: { backgroundColor: C.accent, borderColor: C.accent },
    chipDisabled: { opacity: 0.4 },
    chipTxt: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
    chipTxtActive: { color: C.cream },
    speedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    speedBtn: {
      width: 36, height: 36, borderRadius: 8, backgroundColor: C.bg,
      alignItems: 'center', justifyContent: 'center',
    },
    speedBtnTxt: { color: C.textPrimary, fontSize: 18, fontWeight: '700' },
    speedTrack: { flex: 1, height: 6, backgroundColor: C.bg, borderRadius: 3, overflow: 'hidden' },
    speedFill: { height: '100%', backgroundColor: C.accent, borderRadius: 3 },
    speedValue: { color: C.textPrimary, fontSize: 14, fontWeight: '700', minWidth: 40, textAlign: 'right' },
    saveBtn: {
      backgroundColor: C.accent, borderRadius: 8, padding: 12, alignItems: 'center',
    },
    saveBtnTxt: { color: C.cream, fontSize: 14, fontWeight: '700' },
    smallBtn: { backgroundColor: C.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    smallBtnTxt: { color: C.accent, fontSize: 12, fontWeight: '700' },
    hint: { color: C.textMuted, fontSize: 12 },
    hintError: { color: C.danger },
    input: {
      backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border,
      color: C.textPrimary, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10,
    },
    authForm: { gap: 10 },
    modeSwitch: { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 8, padding: 3 },
    modeBtn: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
    modeBtnActive: { backgroundColor: C.accent },
    modeBtnTxt: { color: C.textSecondary, fontSize: 12, fontWeight: '700' },
    modeBtnTxtActive: { color: C.cream },
    disabled: { opacity: 0.5 },
    cardSubtitle: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
    voiceList: { gap: 8 },
    voiceItem: {
      backgroundColor: C.bg, borderRadius: 8, borderWidth: 1,
      borderColor: C.border, padding: 10, gap: 4,
    },
    voiceItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    voiceName: { color: C.textPrimary, fontSize: 13, fontWeight: '700', flex: 1 },
    voiceBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    voiceBadgeActive: { backgroundColor: 'rgba(49,95,72,0.3)' },
    voiceBadgeExpired: { backgroundColor: 'rgba(200,60,60,0.2)' },
    voiceBadgeTxt: { color: C.textSecondary, fontSize: 10, fontWeight: '700' },
    voiceMeta: { color: C.textMuted, fontSize: 11 },
    voiceCatalogChip: {
      backgroundColor: C.bg, borderRadius: 8, borderWidth: 1,
      borderColor: C.border, paddingHorizontal: 12, paddingVertical: 8, gap: 2,
    },
    voiceCatalogName: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
    voiceCatalogMeta: { color: C.textMuted, fontSize: 11 },
    diagnosticsBox: {
      minHeight: 120,
      maxHeight: 220,
      backgroundColor: C.bg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C.border,
      padding: 10,
    },
    diagnosticsText: { color: C.textSecondary, fontSize: 11, lineHeight: 16 },
    appVersion: { color: C.textMuted, fontSize: 11, textAlign: 'center', paddingBottom: 16 },
  }), [C])
  return (
    <KeyboardAvoidingView style={styles.shell} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.title}>{tr('settings.title')}</Text>

      {/* Language */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr('settings.language')}</Text>
        <View style={styles.chipRow}>
          {(['en', 'zh'] as const).map(l => (
            <Pressable
              key={l}
              onPress={() => onSetLocale(l)}
              disabled={settingsLoading}
              style={[styles.chip, locale === l && styles.chipActive, settingsLoading && styles.chipDisabled]}
            >
              <Text style={[styles.chipTxt, locale === l && styles.chipTxtActive]}>{l === 'en' ? tr('settings.language_en') : tr('settings.language_zh')}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Theme */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr('settings.theme')}</Text>
        <View style={styles.chipGrid}>
          {(Object.keys(themeLabels) as ThemeKey[]).map(k => (
            <Pressable key={k} onPress={() => onSetTheme(k)} style={[styles.chip, themeKey === k && styles.chipActive]}>
              <Text style={[styles.chipTxt, themeKey === k && styles.chipTxtActive]}>
                {locale === 'zh' ? themeLabels[k].zh : themeLabels[k].en}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* TTS Provider */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{tr('settings.tts_provider')}</Text>
          <Pressable onPress={onLoadPreferences} disabled={settingsLoading} style={styles.smallBtn}>
            <Text style={styles.smallBtnTxt}>{settingsLoading ? '…' : tr('settings.reload')}</Text>
          </Pressable>
        </View>
        <View style={styles.chipGrid}>
          {availableProviders.map(p => (
            <Pressable
              key={p}
              onPress={() => onSaveProvider(p)}
              disabled={settingsLoading}
              style={[styles.chip, ttsProvider === p && styles.chipActive, settingsLoading && styles.chipDisabled]}
            >
              <Text style={[styles.chipTxt, ttsProvider === p && styles.chipTxtActive]}>
                {tr(`settings.tts_provider_${p}`) !== `settings.tts_provider_${p}` ? tr(`settings.tts_provider_${p}`) : p}
              </Text>
            </Pressable>
          ))}
        </View>
        {settingsMessage && <Text style={styles.hint}>{settingsMessage}</Text>}
      </View>

      {/* Session STT Provider */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr('settings.session_stt_provider')}</Text>
        <View style={styles.chipGrid}>
          {availableSessionSttProviders.map(provider => (
            <Pressable
              key={provider}
              onPress={() => onSetSessionSttProvider(provider)}
              disabled={settingsLoading}
              style={[styles.chip, sessionSttProvider === provider && styles.chipActive, settingsLoading && styles.chipDisabled]}
            >
              <Text style={[styles.chipTxt, sessionSttProvider === provider && styles.chipTxtActive]}>
                {tr(`settings.session_stt_provider_${provider}`)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>{tr('settings.session_stt_provider_hint')}</Text>
      </View>

      {/* Coach Voice */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr('settings.voice_profile_current')}</Text>
        {selectedVoiceProfile ? (
          <View style={styles.voiceItem}>
            <View style={styles.voiceItemRow}>
              <Text style={styles.voiceName}>{voiceProfileName(selectedVoiceProfile)}</Text>
              <View style={[styles.voiceBadge, selectedVoiceProfile.status === 'active' ? styles.voiceBadgeActive : styles.voiceBadgeExpired]}>
                <Text style={styles.voiceBadgeTxt}>
                  {selectedVoiceProfile.status === 'active' ? tr('settings.xunfei_voice_active') : tr('settings.voice_profile_unavailable')}
                </Text>
              </View>
            </View>
            <Text style={styles.voiceMeta}>{voiceProfileMeta(selectedVoiceProfile)}</Text>
          </View>
        ) : (
          <Text style={styles.hint}>{tr('settings.voice_profile_empty')}</Text>
        )}
        {providerVoiceProfiles.length > 0 && (
          <>
            <Text style={styles.cardSubtitle}>{tr('settings.voice_profile_select')}</Text>
            <View style={styles.chipGrid}>
              {providerVoiceProfiles.map(profile => {
                const unavailable = profile.status !== 'active'
                const active = selectedVoiceProfile?.id === profile.id
                return (
                  <Pressable
                    key={profile.id}
                    onPress={() => !unavailable && onSelectVoiceProfile(profile)}
                    disabled={settingsLoading || unavailable}
                    style={[styles.voiceCatalogChip, active && styles.chipActive, unavailable && styles.chipDisabled]}
                  >
                    <Text style={[styles.voiceCatalogName, active && styles.chipTxtActive]}>{voiceProfileName(profile)}</Text>
                    <Text style={styles.voiceCatalogMeta}>{voiceProfileMeta(profile)}</Text>
                  </Pressable>
                )
              })}
            </View>
          </>
        )}
      </View>

      {ttsProvider === 'xunfei' && xunfeiVoices.length === 0 && providerVoiceProfiles.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr('settings.xunfei_voice_config')}</Text>
          <Text style={styles.hint}>{tr('settings.xunfei_voice_empty')}</Text>
        </View>
      )}

      {/* TTS Speed */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr('settings.tts_speed')}</Text>
        <View style={styles.speedRow}>
          <Pressable onPress={() => onAdjustSpeed(-0.1)} disabled={settingsLoading} style={[styles.speedBtn, settingsLoading && styles.chipDisabled]}>
            <Text style={styles.speedBtnTxt}>−</Text>
          </Pressable>
          <View style={styles.speedTrack}>
            <View style={[styles.speedFill, { width: `${speedFill * 100}%` }]} />
          </View>
          <Pressable onPress={() => onAdjustSpeed(0.1)} disabled={settingsLoading} style={[styles.speedBtn, settingsLoading && styles.chipDisabled]}>
            <Text style={styles.speedBtnTxt}>+</Text>
          </Pressable>
          <Text style={styles.speedValue}>{ttsSpeed.toFixed(1)}×</Text>
        </View>
        <Pressable onPress={onSavePracticePreferences} disabled={settingsLoading} style={[styles.saveBtn, settingsLoading && styles.disabled]}>
          <Text style={styles.saveBtnTxt}>{tr('settings.save')}</Text>
        </Pressable>
      </View>

      {/* API URL */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{tr('settings.api_url')}</Text>
          {apiBaseUrlSource === 'user' && (
            <Pressable onPress={onResetApiBaseUrl} style={styles.smallBtn}>
              <Text style={styles.smallBtnTxt}>{tr('settings.api_url_reset')}</Text>
            </Pressable>
          )}
        </View>
        <TextInput
          style={styles.input}
          value={apiBaseUrl}
          onChangeText={onSetApiBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          placeholderTextColor={C.textMuted}
          placeholder="http://localhost:3000"
        />
        <Text style={styles.hint}>
          {apiBaseUrlSource === 'user'
            ? tr('settings.api_url_source_user')
            : `${tr('settings.api_url_source_default')}: ${defaultApiBaseUrl}`}
        </Text>
      </View>

      {/* Diagnostics */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Voice diagnostics</Text>
          <View style={styles.chipRow}>
            <Pressable onPress={onShareVoiceMetrics} style={styles.smallBtn}>
              <Text style={styles.smallBtnTxt}>Logs</Text>
            </Pressable>
            <Pressable onPress={onShareASREvaluation} style={styles.smallBtn}>
              <Text style={styles.smallBtnTxt}>ASR</Text>
            </Pressable>
            <Pressable onPress={onClearVoiceMetrics} style={styles.smallBtn}>
              <Text style={styles.smallBtnTxt}>Clear</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.diagnosticsBox}>
          <ScrollView nestedScrollEnabled>
            <Text selectable style={styles.diagnosticsText}>
              {voiceMetricsText || asrEvaluationText || 'No voice metrics yet.'}
            </Text>
          </ScrollView>
        </View>
      </View>

      {/* Auth */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{tr('nav.account')}</Text>
          {auth.state === 'signed-in' ? (
            <Pressable onPress={onSignOut} style={styles.smallBtn}>
              <Text style={styles.smallBtnTxt}>{tr('settings.sign_out')}</Text>
            </Pressable>
          ) : (
            <View style={styles.modeSwitch}>
              {(['sign-in', 'sign-up'] as const).map(m => (
                <Pressable
                  key={m}
                  onPress={() => onSetAuthMode(m)}
                  disabled={authSubmitting || auth.state === 'loading'}
                  style={[styles.modeBtn, authMode === m && styles.modeBtnActive, (authSubmitting || auth.state === 'loading') && styles.disabled]}
                >
                  <Text style={[styles.modeBtnTxt, authMode === m && styles.modeBtnTxtActive]}>
                    {m === 'sign-in' ? tr('login.signin') : tr('login.signup')}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        {auth.state === 'signed-in' ? (
          <Text style={styles.hint}>
            {(auth.user?.user_metadata?.display_name as string | undefined)
              ?? (auth.user?.user_metadata?.username as string | undefined)
              ?? auth.user?.email?.replace(/@users\.meteorvoice\.local$/, '')}
          </Text>
        ) : null}
        {auth.state !== 'signed-in' && auth.message ? (
          <Text style={styles.hintError}>{auth.message}</Text>
        ) : null}
        {auth.state !== 'signed-in' && (
          <View style={styles.authForm}>
            <TextInput
              style={styles.input} value={email} onChangeText={onSetEmail}
              autoCapitalize="none" autoCorrect={false} inputMode="email"
              editable={!authSubmitting && auth.state !== 'loading'}
              placeholder={tr('login.account_placeholder')} placeholderTextColor={C.textMuted}
            />
            <TextInput
              style={styles.input} value={password} onChangeText={onSetPassword}
              editable={!authSubmitting && auth.state !== 'loading'}
              secureTextEntry placeholder={tr('login.password')} placeholderTextColor={C.textMuted}
            />
            <Pressable
              onPress={onSubmitAuth}
              disabled={authSubmitting || auth.state === 'loading'}
              style={[styles.saveBtn, (authSubmitting || auth.state === 'loading') && styles.disabled]}
            >
              <Text style={styles.saveBtnTxt}>
                {authSubmitting || auth.state === 'loading' ? tr('login.loading') : authMode === 'sign-in' ? tr('login.signin') : tr('login.signup')}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
      <Text style={styles.appVersion}>MeteorVoice {appVersion}</Text>
    </ScrollView>
    </KeyboardAvoidingView>
  )
}
