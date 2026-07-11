/**
 * App settings and preferences screen.
 * 应用设置与偏好界面。
 */

import {
  useMemo,
} from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import type {
  Locale,
  TranslateFn,
} from '@meteorvoice/shared'

import type { ThemeKey } from '../theme'
import { DiagnosticsSection } from '../components/DiagnosticsSection'
import { useAuthFormState } from '../hooks/useAuthFormState'
import { useSettingsPreferencesState } from '../hooks/useSettingsPreferencesState'
import { useLog } from '../LogContext'
import { useSession } from '../SessionContext'
import { themeLabels } from '../theme'
import { useTheme } from '../ThemeProvider'

interface Props {
  tr: TranslateFn
  locale: Locale
  appVersion: string
  defaultApiBaseUrl: string
  auth: import('../mobileAuth').MobileAuthState
  signOut: (nextMessage?: string | null) => Promise<void>
  handleUnauthorized: () => void
  getAuthHeaders: () => Promise<HeadersInit>
  onLocaleChange: (l: Locale) => void
}

export function SettingsScreen({
  tr, locale, appVersion, defaultApiBaseUrl,
  auth, signOut, handleUnauthorized, getAuthHeaders,
  onLocaleChange,
}: Props) {
  const { voiceMetricsText, asrEvaluationText, clearVoiceMetrics, logMetric } = useLog()
  const {
    applyTtsPreferences,
    clearAudio,
    selectedAccentKey: ctxAccentKey,
    selectedScenarioKey: ctxScenarioKey,
    ttsProvider: ctxTtsProvider,
    ttsVoiceId: ctxTtsVoiceId,
  } = useSession()
  const { C, setTheme: setThemeLocal, themeKey } = useTheme()

  const preferences = useSettingsPreferencesState({
    auth,
    clearAudio,
    ctxAccentKey,
    ctxScenarioKey,
    ctxTtsProvider,
    ctxTtsVoiceId,
    defaultApiBaseUrl,
    getAuthHeaders,
    handleUnauthorized,
    locale,
    logMetric,
    onTtsPreferencesChange: applyTtsPreferences,
    onLocaleChange,
    setThemeLocal,
    tr,
  })
  const {
    apiBaseUrl,
    apiBaseUrlSource,
    availableProviders,
    availableSessionSttProviders,
    onAdjustSpeed,
    onLoadPreferences,
    onResetApiBaseUrl,
    onSavePracticePreferences,
    onSaveProvider,
    onSelectVoiceProfile,
    onSetApiBaseUrl,
    onSetLocale,
    onSetSessionSttProvider,
    onSetTheme,
    providerVoiceProfiles,
    selectedVoiceProfile,
    sessionSttProvider,
    settingsLoading,
    settingsMessage,
    speedFill,
    ttsProvider,
    ttsSpeed,
    voiceProfileMeta,
    voiceProfileName,
    xunfeiVoices,
  } = preferences
  const {
    authMode,
    authSubmitting,
    email,
    password,
    setAuthMode: onSetAuthMode,
    setEmail: onSetEmail,
    setPassword: onSetPassword,
    submitAuth: onSubmitAuth,
  } = useAuthFormState({ auth, tr })
  const onSignOut = () => { void signOut() }
  const onClearVoiceMetrics = clearVoiceMetrics
  const onShareVoiceMetrics = () => Share.share({ title: 'MeteorVoice voice diagnostics', message: voiceMetricsText })
  const onShareASREvaluation = () => Share.share({ title: 'MeteorVoice ASR evaluation', message: asrEvaluationText })

  // ─── Styles / 样式 ───
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

  // ─── Render / 渲染 ───
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

      <DiagnosticsSection
        asrEvaluationText={asrEvaluationText}
        onClearVoiceMetrics={onClearVoiceMetrics}
        onShareASREvaluation={onShareASREvaluation}
        onShareVoiceMetrics={onShareVoiceMetrics}
        styles={styles}
        voiceMetricsText={voiceMetricsText}
      />

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
