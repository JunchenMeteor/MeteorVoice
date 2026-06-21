/**
 * Session history and review screen.
 * 会话历史记录界面。
 */

import {
  useMemo,
} from 'react'
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
import type {
  HistorySession,
  MeteorVoiceApiClient,
} from '@meteorvoice/api-client'
import {
  accentProfiles,
  getAccentLabel,
  getScenarioLabel,
  scenarios,
} from '@meteorvoice/shared'

import { useHistoryScreenState } from '../hooks/useHistoryScreenState'
import { useTheme } from '../ThemeProvider'

interface Props {
  tr: TranslateFn
  locale: Locale
  api: MeteorVoiceApiClient
  getAuthHeaders: () => Promise<HeadersInit>
  handleUnauthorized: () => void
  defaultApiBaseUrl: string
}

function scenarioLabel(entry: HistorySession, locale: Locale) {
  const s = scenarios.find(x => x.key === (entry.scenario_key ?? entry.scenario))
  return s ? getScenarioLabel(s, locale) : entry.scenario
}

function accentLabel(entry: HistorySession, locale: Locale) {
  const a = accentProfiles.find(x => x.key === (entry.accent_key ?? entry.accent))
  return a ? getAccentLabel(a, locale) : entry.accent
}

export function HistoryScreen({ tr, locale, api, getAuthHeaders, handleUnauthorized, defaultApiBaseUrl }: Props) {
  const { C } = useTheme()
  const {
    deleteSession,
    error,
    expandedId,
    filtered,
    filterScenario,
    loadHistory,
    loading,
    selectedHistory,
    selectedTurns,
    setFilterScenario,
    toggle,
  } = useHistoryScreenState({ api, handleUnauthorized })

  // ─── Styles / 样式 ───
  const styles = useMemo(() => StyleSheet.create({
    shell: { flex: 1, backgroundColor: C.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
    },
    title: { color: C.textPrimary, fontSize: 22, fontWeight: '800' },
    loadBtn: { backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
    loadTxt: { color: C.accent, fontSize: 13, fontWeight: '700' },
    filterBar: { maxHeight: 44 },
    filterContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
    filterChip: {
      backgroundColor: C.surface, borderRadius: 8, borderWidth: 1,
      borderColor: C.border, paddingHorizontal: 10, paddingVertical: 6,
    },
    filterChipActive: { backgroundColor: C.accent, borderColor: C.accent },
    filterChipTxt: { color: C.textSecondary, fontSize: 12, fontWeight: '600' },
    filterChipTxtActive: { color: C.cream },
    error: { color: '#ff8a80', fontSize: 13, paddingHorizontal: 16, marginBottom: 8 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyTxt: { color: C.textMuted, fontSize: 14 },
    list: { paddingHorizontal: 16, gap: 10, paddingTop: 4 },
    card: {
      backgroundColor: C.surface, borderRadius: 12,
      borderWidth: 1, borderColor: C.border, padding: 14,
    },
    cardActive: { borderColor: C.accent },
    cardDeleted: { opacity: 0.5 },
    cardRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    cardLeft: { gap: 4, flex: 1 },
    cardScenario: { color: C.textPrimary, fontSize: 14, fontWeight: '700' },
    cardMeta: { color: C.textMuted, fontSize: 12 },
    cardRight: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
    statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    statusCompleted: { backgroundColor: 'rgba(49,95,72,0.25)' },
    statusDeleted: { backgroundColor: 'rgba(200,60,60,0.2)' },
    statusTxt: { color: C.textSecondary, fontSize: 11, fontWeight: '700' },
    deleteBtn: { padding: 2 },
    deleteTxt: { color: C.textMuted, fontSize: 12 },
    chevron: { color: C.textMuted, fontSize: 12, marginTop: 6 },
    detail: { marginTop: 12, gap: 10 },
    summary: { color: C.textSecondary, fontSize: 13, lineHeight: 19 },
    noSummary: { color: C.textMuted, fontSize: 13 },
    turns: { gap: 8 },
    turn: { backgroundColor: C.bg, borderRadius: 8, padding: 10, gap: 4 },
    turnSpeaker: { color: C.gold, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
    turnContent: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
    corrections: { marginTop: 6, gap: 6 },
    correction: {
      borderWidth: 1, borderColor: C.border, borderRadius: 6,
      padding: 8, gap: 4,
    },
    correctionBadge: {
      alignSelf: 'flex-start', backgroundColor: 'rgba(214,196,134,0.2)',
      borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
    },
    correctionBadgeTxt: { color: C.gold, fontSize: 10, fontWeight: '700' },
    correctionTexts: { fontSize: 12 },
    correctionOriginal: { color: C.danger, textDecorationLine: 'line-through' },
    correctionArrow: { color: C.textMuted },
    correctionSuggested: { color: C.success },
    correctionExplanation: { color: C.textMuted, fontSize: 11, lineHeight: 16 },
  }), [C])

  // ─── Render / 渲染 ───
  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <Text style={styles.title}>{tr('history.title')}</Text>
        <Pressable onPress={loadHistory} style={styles.loadBtn} disabled={loading}>
          <Text style={styles.loadTxt}>{loading ? tr('history.loading') : tr('nav.history') || 'Refresh'}</Text>
        </Pressable>
      </View>

      {/* 场景筛选 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterContent}>
        <Pressable onPress={() => setFilterScenario(null)} style={[styles.filterChip, filterScenario === null && styles.filterChipActive]}>
          <Text style={[styles.filterChipTxt, filterScenario === null && styles.filterChipTxtActive]}>{tr('history.filter_all')}</Text>
        </Pressable>
        {scenarios.map(s => (
          <Pressable key={s.key} onPress={() => setFilterScenario(s.key)} style={[styles.filterChip, filterScenario === s.key && styles.filterChipActive]}>
            <Text style={[styles.filterChipTxt, filterScenario === s.key && styles.filterChipTxtActive]}>{s.icon} {getScenarioLabel(s, locale)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {error && <Text style={styles.error}>{error}</Text>}

      {filtered.length === 0 && !loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTxt}>{tr('history.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const expanded = expandedId === item.id
            const isCurrent = selectedHistory?.id === item.id
            const isDeleted = item.status === 'deleted'
            return (
              <Pressable
                style={[styles.card, isCurrent && styles.cardActive, isDeleted && styles.cardDeleted]}
                onPress={() => toggle(item.id)}
              >
                <View style={styles.cardRow}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.cardScenario}>{scenarioLabel(item, locale)}</Text>
                    <Text style={styles.cardMeta}>{item.date} · {accentLabel(item, locale)}</Text>
                  </View>
                  <View style={styles.cardRight}>
                    <View style={[styles.statusBadge, isDeleted ? styles.statusDeleted : styles.statusCompleted]}>
                      <Text style={styles.statusTxt}>{tr(`history.status.${item.status}`) || item.status}</Text>
                    </View>
                    {!isDeleted && (
                      <Pressable onPress={() => deleteSession(item.id)} style={styles.deleteBtn} hitSlop={8}>
                        <Text style={styles.deleteTxt}>✕</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
                <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
                {expanded && (
                  <View style={styles.detail}>
                    {item.summary ? (
                      <Text style={styles.summary}>{item.summary}</Text>
                    ) : (
                      <Text style={styles.noSummary}>{tr('history.empty_hint')}</Text>
                    )}
                    {selectedTurns.length > 0 && isCurrent && (
                      <View style={styles.turns}>
                        {selectedTurns.map((turn, i) => (
                          <View key={i} style={styles.turn}>
                            <Text style={styles.turnSpeaker}>
                              {turn.speaker === 'user' ? tr('session.you') : tr('session.coach')}
                            </Text>
                            <Text style={styles.turnContent}>{turn.transcript}</Text>
                            {turn.corrections.length > 0 && (
                              <View style={styles.corrections}>
                                {turn.corrections.map((c, ci) => (
                                  <View key={ci} style={styles.correction}>
                                    <View style={styles.correctionBadge}>
                                      <Text style={styles.correctionBadgeTxt}>{tr(`correction.type.${c.type}`) || c.type}</Text>
                                    </View>
                                    <Text style={styles.correctionTexts}>
                                      <Text style={styles.correctionOriginal}>{c.originalText}</Text>
                                      <Text style={styles.correctionArrow}>{' → '}</Text>
                                      <Text style={styles.correctionSuggested}>{c.suggestedText}</Text>
                                    </Text>
                                    {!!c.explanation && (
                                      <Text style={styles.correctionExplanation}>{c.explanation}</Text>
                                    )}
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
            )
          }}
        />
      )}
    </View>
  )
}
