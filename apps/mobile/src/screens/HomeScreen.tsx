/**
 * Home screen with scenario selection.
 * 场景选择主界面。
 */

import { useMemo } from 'react'
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type {
  Locale,
  TranslateFn,
} from '@meteorvoice/shared'
import type { scenarios as ScenariosType } from '@meteorvoice/shared'
import {
  getDifficultyLabel,
  getScenarioDescription,
  getScenarioLabel,
} from '@meteorvoice/shared'

import { useSession } from '../SessionContext'
import { useTheme } from '../ThemeProvider'

type Scenario = (typeof ScenariosType)[number]

interface Props {
  tr: TranslateFn
  locale: Locale
  scenarios: Scenario[]
  onGoToSession: () => void
}

export function HomeScreen({
  tr, locale, scenarios,
  onGoToSession,
}: Props) {
  const { selectedScenarioKey, isSessionActive, selectScenario, scenarioSwitching } = useSession()
  const { C } = useTheme()
  async function handleScenario(key: string) {
    const shouldNavigate = await selectScenario(key)
    if (shouldNavigate) onGoToSession()
  }


  const styles = useMemo(() => StyleSheet.create({
    shell: { flex: 1, backgroundColor: C.bg },
    content: { paddingHorizontal: 16, gap: 16 },
    title: { color: C.textPrimary, fontSize: 22, fontWeight: '800' },
    subtitle: { color: C.textMuted, fontSize: 14 },
    grid: { gap: 12 },
    row: { gap: 12 },
    card: {
      flex: 1, backgroundColor: C.surface, borderRadius: 12,
      borderWidth: 1, borderColor: C.border, padding: 14, gap: 6,
    },
    cardActive: { borderColor: C.accent, backgroundColor: 'rgba(49,95,72,0.2)' },
    cardDisabled: { opacity: 0.5 },
    cardIcon: { fontSize: 22 },
    cardName: { color: C.textPrimary, fontSize: 14, fontWeight: '700' },
    cardNameActive: { color: C.cream },
    cardDesc: { color: C.textMuted, fontSize: 12, lineHeight: 17 },
    badge: {
      alignSelf: 'flex-start', backgroundColor: 'rgba(49,95,72,0.25)',
      borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    },
    badgeActive: { backgroundColor: 'rgba(214,196,134,0.2)' },
    badgeTxt: { color: C.accent, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
    badgeTxtActive: { color: C.gold },
    resumeBtn: {
      backgroundColor: C.accent, borderRadius: 10, padding: 14, alignItems: 'center',
    },
    resumeTxt: { color: C.cream, fontSize: 14, fontWeight: '700' },
  }), [C])

  // ─── Render / 渲染 ───
  return (
    <ScrollView
      style={styles.shell}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>{tr('home.title')}</Text>
      <Text style={styles.subtitle}>{tr('home.subtitle')}</Text>

      <FlatList
        data={scenarios}
        keyExtractor={item => item.key}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        scrollEnabled={false}
        renderItem={({ item }) => {
          const active = item.key === selectedScenarioKey
          return (
            <Pressable
              style={[styles.card, active && styles.cardActive, scenarioSwitching && styles.cardDisabled]}
              disabled={scenarioSwitching}
              onPress={() => { void handleScenario(item.key) }}
            >
              <Text style={styles.cardIcon}>{item.icon}</Text>
              <Text style={[styles.cardName, active && styles.cardNameActive]} numberOfLines={1}>
                {getScenarioLabel(item, locale)}
              </Text>
              <Text style={styles.cardDesc} numberOfLines={2}>{getScenarioDescription(item, locale)}</Text>
              <View style={[styles.badge, active && styles.badgeActive]}>
                <Text style={[styles.badgeTxt, active && styles.badgeTxtActive]}>{getDifficultyLabel(item.difficulty, locale)}</Text>
              </View>
            </Pressable>
          )
        }}
      />

      {isSessionActive && (
        <Pressable style={styles.resumeBtn} onPress={onGoToSession}>
          <Text style={styles.resumeTxt}>{tr('home.start_over')}</Text>
        </Pressable>
      )}
    </ScrollView>
  )
}
