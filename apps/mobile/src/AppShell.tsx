/**
 * Mobile app shell — tab navigation and screen composition.
 * 移动端外壳 — 标签导航与页面组合。
 */

import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type { MeteorVoiceApiClient } from '@meteorvoice/api-client'
import type {
  AppFeedbackState,
  Locale,
  TranslateFn,
} from '@meteorvoice/shared'
import {
  scenarios,
} from '@meteorvoice/shared'

import type { SessionContextValue } from './SessionContext'
import type { MobileAuthState } from './mobileAuth'
import type { Tab } from './sessionRuntime'
import { AppFeedbackOverlay } from './components/AppFeedbackOverlay'
import { HistoryScreen } from './screens/HistoryScreen'
import { HomeScreen } from './screens/HomeScreen'
import { SessionScreen } from './screens/SessionScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SessionContext } from './SessionContext'
import { useTheme } from './ThemeProvider'

const TAB_LABELS: Record<Tab, string> = {
  history: 'nav.history',
  home: 'nav.home',
  session: 'nav.practice',
  settings: 'nav.settings',
}

interface AppShellProps {
  accentName: string
  accentRegion: string
  activeFeedback: AppFeedbackState | null
  activeTab: Tab
  api: MeteorVoiceApiClient
  appVersion: string
  auth: MobileAuthState
  defaultApiBaseUrl: string
  getAuthHeaders: () => Promise<HeadersInit>
  handleUnauthorized: () => void
  locale: Locale
  scenarioDescription: string
  scenarioDifficulty: string
  scenarioIcon: string
  scenarioName: string
  selectTab: (tab: Tab) => void
  sessionContext: SessionContextValue
  setActiveTab: (tab: Tab) => void
  setLocale: (locale: Locale) => void
  signOut: (nextMessage?: string | null) => Promise<void>
  tr: TranslateFn
}

function TabIcon({ tab, color }: { color: string; tab: Tab }) {
  if (tab === 'home') return (
    <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View style={{ width: 0, height: 0, borderLeftWidth: 9, borderRightWidth: 9, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color, marginBottom: 1 }} />
      <View style={{ width: 12, height: 8, backgroundColor: color, borderRadius: 1 }} />
    </View>
  )
  if (tab === 'session') return (
    <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center', gap: 1 }}>
      <View style={{ width: 8, height: 11, borderRadius: 4, borderWidth: 2, borderColor: color }} />
      <View style={{ width: 12, height: 2, backgroundColor: color, borderRadius: 1 }} />
    </View>
  )
  if (tab === 'history') return (
    <View style={{ width: 18, height: 18, justifyContent: 'center', gap: 3 }}>
      {[0, 1, 2].map(i => <View key={i} style={{ height: 2, backgroundColor: color, borderRadius: 1, width: i === 0 ? 18 : i === 1 ? 14 : 10 }} />)}
    </View>
  )
  return (
    <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: color }} />
      <View style={{ position: 'absolute', width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
        {[0, 45, 90, 135].map(deg => (
          <View key={deg} style={{ position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: color, transform: [{ rotate: `${deg}deg` }, { translateY: -8 }] }} />
        ))}
      </View>
    </View>
  )
}

export function AppShell({
  accentName,
  accentRegion,
  activeFeedback,
  activeTab,
  api,
  appVersion,
  auth,
  defaultApiBaseUrl,
  getAuthHeaders,
  handleUnauthorized,
  locale,
  scenarioDescription,
  scenarioDifficulty,
  scenarioIcon,
  scenarioName,
  selectTab,
  sessionContext,
  setActiveTab,
  setLocale,
  signOut,
  tr,
}: AppShellProps) {
  const { C } = useTheme()
  const styles = StyleSheet.create({
    content: { flex: 1 },
    shell: { flex: 1, backgroundColor: C.bg },
    tabBar: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 24, borderWidth: 1, borderColor: C.border, paddingVertical: 4, paddingHorizontal: 4 },
    tabBarWrapper: { paddingHorizontal: 16, paddingBottom: 8, paddingTop: 6, backgroundColor: C.bg },
    tabItem: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2, borderRadius: 20 },
    tabItemActive: { backgroundColor: C.accent },
    tabLabel: { fontSize: 10, color: C.textMuted, fontWeight: '600' },
    tabLabelActive: { color: C.cream },
  })

  return (
    <SafeAreaView style={styles.shell}>
      <View style={styles.content}>
        <SessionContext.Provider value={sessionContext}>
          {activeTab === 'home' && <HomeScreen tr={tr} locale={locale} scenarios={scenarios} onGoToSession={() => setActiveTab('session')} />}
          {activeTab === 'session' && <SessionScreen tr={tr} accentName={accentName} accentRegion={accentRegion} scenarioName={scenarioName} scenarioIcon={scenarioIcon} scenarioDifficulty={scenarioDifficulty} scenarioDescription={scenarioDescription} />}
          {activeTab === 'history' && <HistoryScreen tr={tr} locale={locale} api={api} authState={auth.state} authUserId={auth.user?.id ?? null} handleUnauthorized={handleUnauthorized} refreshKey={0} />}
          {activeTab === 'settings' && <SettingsScreen tr={tr} locale={locale} appVersion={appVersion} defaultApiBaseUrl={defaultApiBaseUrl} auth={auth} signOut={signOut} handleUnauthorized={handleUnauthorized} getAuthHeaders={getAuthHeaders} onLocaleChange={setLocale} />}
        </SessionContext.Provider>
        <AppFeedbackOverlay feedback={activeFeedback} />
      </View>
      <View style={styles.tabBarWrapper}>
        <View style={styles.tabBar}>
          {(['home', 'session', 'history', 'settings'] as Tab[]).map(tab => (
            <Pressable key={tab} onPress={() => selectTab(tab)} style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}>
              <TabIcon tab={tab} color={activeTab === tab ? C.cream : C.textMuted} />
              <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>{tr(TAB_LABELS[tab])}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  )
}
