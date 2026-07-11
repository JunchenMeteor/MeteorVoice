/**
 * Four-tab layout using the original MeteorVoice visual language.
 * The tab bar stays opaque and participates in layout so scroll content never
 * shows through or underneath it.
 */
import { Tabs } from 'expo-router'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useSession } from '../../src/SessionContext'
import { useTheme } from '../../src/ThemeProvider'

const TAB_LABELS: Record<string, string> = {
  home: 'nav.home',
  session: 'nav.practice',
  history: 'nav.history',
  settings: 'nav.settings',
}

function TabIcon({ tab, color }: { color: string; tab: string }) {
  if (tab === 'home') return (
    <View style={styles.homeIcon}>
      <View style={[styles.homeRoof, { borderBottomColor: color }]} />
      <View style={[styles.homeBody, { backgroundColor: color }]} />
    </View>
  )

  if (tab === 'session') return (
    <View style={styles.sessionIcon}>
      <View style={[styles.microphone, { borderColor: color }]} />
      <View style={[styles.microphoneBase, { backgroundColor: color }]} />
    </View>
  )

  if (tab === 'history') return (
    <View style={styles.historyIcon}>
      {[18, 14, 10].map(width => (
        <View key={width} style={[styles.historyLine, { width, backgroundColor: color }]} />
      ))}
    </View>
  )

  return (
    <View style={styles.settingsIcon}>
      <View style={[styles.settingsCenter, { borderColor: color }]} />
      <View style={styles.settingsDots}>
        {[0, 45, 90, 135].map(deg => (
          <View
            key={deg}
            style={[
              styles.settingsDot,
              { backgroundColor: color, transform: [{ rotate: `${deg}deg` }, { translateY: -8 }] },
            ]}
          />
        ))}
      </View>
    </View>
  )
}

export default function TabLayout() {
  const { C } = useTheme()
  const { tr } = useSession()

  return (
    <SafeAreaView edges={['top']} style={[styles.shell, { backgroundColor: C.bg }]}>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={({ state, navigation }) => (
          <SafeAreaView edges={['bottom']} style={[styles.tabBarWrapper, { backgroundColor: C.bg }]}>
            <View style={[styles.tabBar, { backgroundColor: C.surface, borderColor: C.border }]}>
              {state.routes.map((route, index) => {
                const focused = state.index === index
                const labelKey = TAB_LABELS[route.name]

                return (
                  <Pressable
                    key={route.key}
                    accessibilityRole="button"
                    accessibilityState={focused ? { selected: true } : {}}
                    accessibilityLabel={labelKey ? tr(labelKey) : route.name}
                    onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                    onPress={() => {
                      const event = navigation.emit({
                        type: 'tabPress',
                        target: route.key,
                        canPreventDefault: true,
                      })
                      if (!focused && !event.defaultPrevented) navigation.navigate(route.name)
                    }}
                    style={[styles.tabItem, focused && { backgroundColor: C.accent }]}
                  >
                    <TabIcon tab={route.name} color={focused ? C.cream : C.textMuted} />
                    <Text style={[styles.tabLabel, { color: focused ? C.cream : C.textMuted }]}>
                      {labelKey ? tr(labelKey) : route.name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </SafeAreaView>
        )}
      >
        <Tabs.Screen name="home" />
        <Tabs.Screen name="session" />
        <Tabs.Screen name="history" />
        <Tabs.Screen name="settings" />
      </Tabs>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  tabBarWrapper: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 2,
    borderRadius: 20,
  },
  tabLabel: { fontSize: 10, fontWeight: '600' },
  homeIcon: { width: 18, height: 18, alignItems: 'center', justifyContent: 'flex-end' },
  homeRoof: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: 1,
  },
  homeBody: { width: 12, height: 8, borderRadius: 1 },
  sessionIcon: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center', gap: 1 },
  microphone: { width: 8, height: 11, borderRadius: 4, borderWidth: 2 },
  microphoneBase: { width: 12, height: 2, borderRadius: 1 },
  historyIcon: { width: 18, height: 18, justifyContent: 'center', gap: 3 },
  historyLine: { height: 2, borderRadius: 1 },
  settingsIcon: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  settingsCenter: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  settingsDots: {
    position: 'absolute',
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsDot: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5 },
})
