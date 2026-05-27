import { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTheme } from '../ThemeProvider'
import type { ScenarioDto, AccentDto } from '@meteorvoice/api-client'
import { getAccentLabel, type accentProfiles as AccentsType, type Locale } from '@meteorvoice/shared'
import type { MobileAuthState } from '../mobileAuth'
import type { XunfeiVoice } from '../mobilePreferences'
import { themeLabels, type ThemeKey } from '../theme'

type Accent = (typeof AccentsType)[number]

interface Props {
  tr: (key: string) => string
  locale: Locale
  ttsProvider: string
  availableProviders: string[]
  ttsSpeed: number
  ttsVoiceId: string | null
  xunfeiVoices: XunfeiVoice[]
  xunfeiVoiceCatalog: XunfeiVoice[]
  remoteAccents: AccentDto[]
  remoteScenarios: ScenarioDto[]
  accentProfiles: Accent[]
  selectedAccentKey: string
  settingsLoading: boolean
  settingsMessage: string | null
  auth: MobileAuthState
  email: string
  password: string
  authMode: 'sign-in' | 'sign-up'
  apiBaseUrl: string
  onSetLocale: (l: string) => void
  onSaveProvider: (p: string) => void
  onAdjustSpeed: (delta: number) => void
  onSavePracticePreferences: () => void
  onLoadPreferences: () => void
  onSelectAccent: (key: string) => void
  onSelectVoice: (id: string) => void
  onSetEmail: (v: string) => void
  onSetPassword: (v: string) => void
  onSetAuthMode: (m: 'sign-in' | 'sign-up') => void
  onSubmitAuth: () => void
  onSignOut: () => void
  onSetApiBaseUrl: (v: string) => void
}

export function SettingsScreen({
  tr, locale, ttsProvider, availableProviders, ttsSpeed,
  ttsVoiceId, xunfeiVoices, xunfeiVoiceCatalog,
  remoteAccents, accentProfiles, selectedAccentKey,
  settingsLoading, settingsMessage,
  auth, email, password, authMode, apiBaseUrl,
  onSetLocale, onSaveProvider, onAdjustSpeed, onSavePracticePreferences,
  onLoadPreferences, onSelectAccent, onSelectVoice,
  onSetEmail, onSetPassword, onSetAuthMode, onSubmitAuth, onSignOut, onSetApiBaseUrl,
}: Props) {
  const { C, themeKey, setTheme } = useTheme()
  const speedFill = Math.max(0, Math.min(1, (ttsSpeed - 0.7) / 0.6))


  const styles = useMemo(() => StyleSheet.create({
    shell: { flex: 1, backgroundColor: C.bg },
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
  }), [C])
  return (
    <ScrollView
      style={styles.shell}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>{tr('settings.title')}</Text>

      {/* Language */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr('settings.language')}</Text>
        <View style={styles.chipRow}>
          {(['en', 'zh'] as const).map(l => (
            <Pressable key={l} onPress={() => onSetLocale(l)} style={[styles.chip, locale === l && styles.chipActive]}>
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
            <Pressable key={k} onPress={() => setTheme(k)} style={[styles.chip, themeKey === k && styles.chipActive]}>
              <Text style={[styles.chipTxt, themeKey === k && styles.chipTxtActive]}>
                {locale === 'zh' ? themeLabels[k].zh : themeLabels[k].en}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Default Accent */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr('settings.default_accent')}</Text>
        <View style={styles.chipGrid}>
          {accentProfiles.map(item => {
            const remote = remoteAccents.find(r => r.key === item.key)
            const active = item.key === selectedAccentKey
            const unavailable = remote?.supported === false
            return (
              <Pressable
                key={item.key}
                onPress={() => !unavailable && onSelectAccent(item.key)}
                style={[styles.chip, active && styles.chipActive, unavailable && styles.chipDisabled]}
              >
                <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{getAccentLabel(item, locale)}</Text>
              </Pressable>
            )
          })}
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
            <Pressable key={p} onPress={() => onSaveProvider(p)} style={[styles.chip, ttsProvider === p && styles.chipActive]}>
              <Text style={[styles.chipTxt, ttsProvider === p && styles.chipTxtActive]}>
                {tr(`settings.tts_provider_${p}`) !== `settings.tts_provider_${p}` ? tr(`settings.tts_provider_${p}`) : p}
              </Text>
            </Pressable>
          ))}
        </View>
        {settingsMessage && <Text style={styles.hint}>{settingsMessage}</Text>}
      </View>

      {/* 讯飞发音人 */}
      {ttsProvider === 'xunfei' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr('settings.xunfei_voice_config')}</Text>
          {xunfeiVoices.length > 0 && (
            <View style={styles.voiceList}>
              {xunfeiVoices.map(v => (
                <View key={`${v.id}-configured`} style={styles.voiceItem}>
                  <View style={styles.voiceItemRow}>
                    <Text style={styles.voiceName}>{v.name}</Text>
                    <View style={[styles.voiceBadge, v.status === 'active' ? styles.voiceBadgeActive : styles.voiceBadgeExpired]}>
                      <Text style={styles.voiceBadgeTxt}>
                        {v.status === 'active' ? tr('settings.xunfei_voice_active') : tr('settings.xunfei_voice_expired')}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.voiceMeta}>
                    {tr(`settings.xunfei_voice_language_${v.language}`)} · {tr(`settings.xunfei_voice_gender_${v.gender}`)} · {tr(`settings.xunfei_voice_tier_${v.tier}`)}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {xunfeiVoiceCatalog.length > 0 && (
            <>
              <Text style={styles.cardSubtitle}>{tr('settings.xunfei_voice_select')}</Text>
              <View style={styles.chipGrid}>
                {xunfeiVoiceCatalog.map(v => {
                  const expired = v.status === 'expired'
                  const active = ttsVoiceId === v.id
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => !expired && onSelectVoice(v.id)}
                      style={[styles.voiceCatalogChip, active && styles.chipActive, expired && styles.chipDisabled]}
                    >
                      <Text style={[styles.voiceCatalogName, active && styles.chipTxtActive]}>{v.name}</Text>
                      <Text style={styles.voiceCatalogMeta}>
                        {tr(`settings.xunfei_voice_gender_${v.gender}`)} · {tr(`settings.xunfei_voice_language_${v.language}`)}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </>
          )}
          {xunfeiVoices.length === 0 && xunfeiVoiceCatalog.length === 0 && (
            <Text style={styles.hint}>{tr('settings.xunfei_voice_empty')}</Text>
          )}
        </View>
      )}

      {/* TTS Speed */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr('settings.tts_speed')}</Text>
        <View style={styles.speedRow}>
          <Pressable onPress={() => onAdjustSpeed(-0.1)} style={styles.speedBtn}>
            <Text style={styles.speedBtnTxt}>−</Text>
          </Pressable>
          <View style={styles.speedTrack}>
            <View style={[styles.speedFill, { width: `${speedFill * 100}%` }]} />
          </View>
          <Pressable onPress={() => onAdjustSpeed(0.1)} style={styles.speedBtn}>
            <Text style={styles.speedBtnTxt}>+</Text>
          </Pressable>
          <Text style={styles.speedValue}>{ttsSpeed.toFixed(1)}×</Text>
        </View>
        <Pressable onPress={onSavePracticePreferences} disabled={settingsLoading} style={styles.saveBtn}>
          <Text style={styles.saveBtnTxt}>{tr('settings.save')}</Text>
        </Pressable>
      </View>

      {/* API URL */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr('settings.api_url')}</Text>
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
                <Pressable key={m} onPress={() => onSetAuthMode(m)} style={[styles.modeBtn, authMode === m && styles.modeBtnActive]}>
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
              placeholder={tr('login.account_placeholder')} placeholderTextColor={C.textMuted}
            />
            <TextInput
              style={styles.input} value={password} onChangeText={onSetPassword}
              secureTextEntry placeholder={tr('login.password')} placeholderTextColor={C.textMuted}
            />
            <Pressable onPress={onSubmitAuth} disabled={auth.state === 'loading'} style={[styles.saveBtn, auth.state === 'loading' && styles.disabled]}>
              <Text style={styles.saveBtnTxt}>
                {auth.state === 'loading' ? tr('login.loading') : authMode === 'sign-in' ? tr('login.signin') : tr('login.signup')}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </ScrollView>
  )
}

