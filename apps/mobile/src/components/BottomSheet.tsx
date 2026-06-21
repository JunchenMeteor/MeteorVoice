/**
 * Bottom sheet with tabs for corrections and transcript.
 * 底部弹窗（纠错/转录标签页）。
 */

import { useMemo } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type {
  ConversationMessage,
  ConversationResponse,
} from '@meteorvoice/shared'

import { useTheme } from '../ThemeProvider'

type Tab = 'corrections' | 'transcript'

interface Props {
  tr: (key: string) => string
  visible: boolean
  onClose: () => void
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  corrections: ConversationResponse['corrections']
  messages: ConversationMessage[]
  onPlayCorrection?: (text: string) => void
}

export function BottomSheet({ tr, visible, onClose, activeTab, onTabChange, corrections, messages, onPlayCorrection }: Props) {
  const { C } = useTheme()

  const styles = useMemo(() => StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderTopWidth: 1,
      borderColor: C.border,
      maxHeight: '78%',
      minHeight: '45%',
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    handle: { width: 48, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginTop: 12, marginBottom: 12 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    title: { color: C.textPrimary, fontSize: 15, fontWeight: '700' },
    closeBtn: { paddingHorizontal: 10, paddingVertical: 6 },
    closeTxt: { color: C.textSecondary, fontSize: 13 },
    tabs: { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 8, padding: 3, marginBottom: 12 },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 6 },
    tabActive: { backgroundColor: C.accent },
    tabTxt: { color: C.textMuted, fontSize: 13, fontWeight: '700' },
    tabTxtActive: { color: C.cream },
    scroll: { flex: 1 },
    scrollContent: { gap: 10, paddingBottom: 16 },
    card: { backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 12, gap: 6 },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    badge: { color: C.gold, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
    playTxt: { color: C.accent, fontSize: 12 },
    correctionText: { fontSize: 13 },
    strikethrough: { color: '#ff8a80', textDecorationLine: 'line-through' },
    muted: { color: C.textMuted },
    suggested: { color: C.success },
    hint: { color: C.textMuted, fontSize: 13, lineHeight: 19 },
    empty: { color: C.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  }), [C])
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>{activeTab === 'corrections' ? tr('session.corrections_tab') : tr('session.transcript_tab')}</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>{tr('session.close_panel')}</Text>
          </Pressable>
        </View>
        <View style={styles.tabs}>
          {(['corrections', 'transcript'] as Tab[]).map(tab => (
            <Pressable key={tab} onPress={() => onTabChange(tab)} style={[styles.tab, activeTab === tab && styles.tabActive]}>
              <Text style={[styles.tabTxt, activeTab === tab && styles.tabTxtActive]}>
                {tab === 'corrections' ? tr('session.corrections_tab') : tr('session.transcript_tab')}
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {activeTab === 'corrections' ? (
            corrections.length === 0
              ? <Text style={styles.empty}>{tr('session.corrections_empty')}</Text>
              : corrections.map((c, i) => (
                <View key={i} style={styles.card}>
                  <View style={styles.cardRow}>
                    <Text style={styles.badge}>{c.type}</Text>
                    {onPlayCorrection && (
                      <Pressable onPress={() => onPlayCorrection(c.suggestedText)}>
                        <Text style={styles.playTxt}>{tr('session.play_correction')}</Text>
                      </Pressable>
                    )}
                  </View>
                  <Text style={styles.correctionText}>
                    <Text style={styles.strikethrough}>{c.originalText}</Text>
                    <Text style={styles.muted}> → </Text>
                    <Text style={styles.suggested}>{c.suggestedText}</Text>
                  </Text>
                  <Text style={styles.hint}>{c.explanation}</Text>
                </View>
              ))
          ) : (
            messages.length === 0
              ? <Text style={styles.empty}>{tr('session.transcript_empty')}</Text>
              : messages.map((m, i) => (
                <View key={i} style={styles.card}>
                  <Text style={styles.badge}>{m.role === 'user' ? tr('session.you') : tr('session.coach')}</Text>
                  <Text style={styles.hint}>{m.content}</Text>
                </View>
              ))
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

