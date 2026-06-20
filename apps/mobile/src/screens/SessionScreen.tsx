import { useMemo, useState } from 'react'
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTheme } from '../ThemeProvider'
import { VoiceWaveform, type WaveformMode } from '../components/VoiceWaveform'
import { BottomSheet } from '../components/BottomSheet'
import type { WorkflowSnapshot } from '@meteorvoice/session-core'
import type { ConversationMessage, ConversationResponse } from '@meteorvoice/shared'

const { width: SW, height: SH } = Dimensions.get('window')

function toWaveformMode(state: WorkflowSnapshot['state'], isActive: boolean): WaveformMode {
  if (!isActive) return state === 'session_ended' ? 'ended' : 'idle'
  switch (state) {
    case 'listening': return 'listening'
    case 'transcribing': return 'transcribing'
    case 'thinking': return 'thinking'
    case 'speaking': return 'speaking'
    case 'session_ended': return 'ended'
    default: return 'idle'
  }
}

import { useSession } from '../SessionContext'

interface Props {
  tr: (key: string) => string
  scenarioName: string
  scenarioIcon: string
  scenarioDifficulty: string
  scenarioDescription: string
  accentName: string
  accentRegion: string
}

export function SessionScreen({
  tr,
  scenarioName, scenarioIcon, scenarioDifficulty, scenarioDescription,
  accentName, accentRegion,
}: Props) {
  const {
    snapshot, messages, corrections, isSessionActive, status, summary, busy,
    startSession, endSession, playCorrection, submitText,
  } = useSession()
  const { C } = useTheme()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'corrections' | 'transcript'>('corrections')
  const [textDraft, setTextDraft] = useState('')

  const waveformMode = toWaveformMode(snapshot.state, isSessionActive)
  const latestCoach = [...messages].reverse().find(m => m.role === 'assistant')
  const latestUser = [...messages].reverse().find(m => m.role === 'user')
  const hasContent = messages.length > 0 || isSessionActive

  const statusColor = isSessionActive ? C.success : C.textMuted

  function openSheet(tab: 'corrections' | 'transcript') {
    setActiveTab(tab)
    setSheetOpen(true)
  }

  function submitTextFallback() {
    const text = textDraft.trim()
    if (!text || busy || !isSessionActive) return
    setTextDraft('')
    submitText(text)
  }


  const styles = useMemo(() => StyleSheet.create({
    shell: { flex: 1, backgroundColor: C.bg },
    gradientCircle: {
      position: 'absolute',
      width: SW * 0.76,
      height: SW * 0.76,
      borderRadius: SW * 0.38,
      backgroundColor: 'rgba(49,95,72,0.14)',
      alignSelf: 'center',
      top: SH * 0.08,
    },
    header: { paddingHorizontal: 16, paddingTop: 8 },
    headerLeft: { gap: 4 },
    scenarioName: { color: C.textPrimary, fontSize: 14, fontWeight: '600' },
    scenarioMeta: { color: C.textMuted, fontSize: 12 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 12 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { color: C.textSecondary, fontSize: 12, flex: 1 },
    scrollArea: { flex: 1 },
    scrollContent: { flexGrow: 1, paddingBottom: 16 },
    stage: { flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 16 },
    avatar: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: 'rgba(49,95,72,0.12)',
      alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { color: C.accent, fontSize: 36, fontWeight: '700' },
    subtitles: { width: '100%', maxWidth: 360, gap: 16 },
    subtitleBlock: { alignItems: 'center', gap: 4 },
    speakerLabel: { color: C.gold, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
    coachText: { color: C.textPrimary, fontSize: 20, fontWeight: '600', textAlign: 'center', lineHeight: 28 },
    userText: { color: C.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    description: { color: C.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 21, maxWidth: 320 },
    summaryBox: {
      marginHorizontal: 16, marginBottom: 12,
      backgroundColor: C.surface, borderRadius: 10, padding: 12,
    },
    summaryTitle: { color: C.accent, fontSize: 13, fontWeight: '700', marginBottom: 4 },
    summaryText: { color: C.textSecondary, fontSize: 13, lineHeight: 19 },
    footer: { paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
    startRow: { alignItems: 'center', gap: 8 },
    startBtn: {
      width: 64, height: 64, borderRadius: 32,
      backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
    },
    playIcon: {
      width: 0, height: 0,
      borderTopWidth: 11, borderBottomWidth: 11, borderLeftWidth: 20,
      borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#fff',
      marginLeft: 4,
    },
    startLabel: { color: C.textPrimary, fontSize: 14, fontWeight: '600' },
    endRow: { alignItems: 'flex-end' },
    endBtn: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center',
    },
    stopIcon: { width: 16, height: 16, borderRadius: 3, backgroundColor: '#fff' },
    disabled: { opacity: 0.4 },
    textFallbackRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    textFallbackInput: {
      flex: 1,
      minHeight: 42,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
      color: C.textPrimary,
      paddingHorizontal: 12,
      fontSize: 14,
    },
    textFallbackButton: {
      minHeight: 42,
      borderRadius: 10,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    textFallbackButtonText: { color: C.cream, fontSize: 13, fontWeight: '700' },
    panelRow: { flexDirection: 'row', gap: 8 },
    panelCard: {
      flex: 1, borderRadius: 10, borderWidth: 1, borderColor: C.border,
      backgroundColor: C.surface, padding: 12, gap: 4,
    },
    panelCardTitle: { color: C.textPrimary, fontSize: 14, fontWeight: '700' },
    panelCardMeta: { color: C.textMuted, fontSize: 12 },
  }), [C])
  return (
    <View style={styles.shell}>
      <View style={styles.gradientCircle} pointerEvents="none" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.scenarioName} numberOfLines={1}>{scenarioIcon} {scenarioName}</Text>
          <Text style={styles.scenarioMeta} numberOfLines={1}>{accentName} ({accentRegion}) · {scenarioDifficulty}</Text>
        </View>
      </View>

      {/* Status row */}
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={styles.statusText} numberOfLines={1}>{tr(status) !== status ? tr(status) : status}</Text>
      </View>

      {/* Scrollable center + summary */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        bounces
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.stage}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>M</Text>
          </View>

          <VoiceWaveform mode={waveformMode} />

          {hasContent ? (
            <View style={styles.subtitles}>
              <View style={styles.subtitleBlock}>
                <Text style={styles.speakerLabel}>{tr('session.coach').toUpperCase()}</Text>
                <Text style={styles.coachText}>
                  {latestCoach?.content ?? tr('session.subtitle_waiting_coach')}
                </Text>
              </View>
              <View style={styles.subtitleBlock}>
                <Text style={styles.speakerLabel}>{tr('session.you').toUpperCase()}</Text>
                <Text style={styles.userText}>
                  {latestUser?.content ?? tr('session.start_speaking')}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.description}>{scenarioDescription}</Text>
          )}
        </View>

        {summary && (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>{tr('session.summary_title')}</Text>
            <Text style={styles.summaryText}>{summary}</Text>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {!isSessionActive ? (
          <View style={styles.startRow}>
            <Pressable
              onPress={startSession}
              disabled={busy}
              style={[styles.startBtn, busy && styles.disabled]}
            >
              <View style={styles.playIcon} />
            </Pressable>
            <Text style={styles.startLabel}>{tr('session.start')}</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <View style={styles.textFallbackRow}>
              <TextInput
                value={textDraft}
                onChangeText={setTextDraft}
                editable={!busy}
                autoCapitalize="sentences"
                autoCorrect
                placeholder={tr('session.text_fallback_placeholder')}
                placeholderTextColor={C.textMuted}
                returnKeyType="send"
                onSubmitEditing={submitTextFallback}
                style={styles.textFallbackInput}
              />
              <Pressable
                onPress={submitTextFallback}
                disabled={busy || !textDraft.trim()}
                style={[styles.textFallbackButton, (busy || !textDraft.trim()) && styles.disabled]}
              >
                <Text style={styles.textFallbackButtonText}>{tr('session.submit_text')}</Text>
              </Pressable>
            </View>
            <View style={styles.endRow}>
              <Pressable onPress={endSession} style={styles.endBtn}>
                <View style={styles.stopIcon} />
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.panelRow}>
          <Pressable style={styles.panelCard} onPress={() => openSheet('corrections')}>
            <Text style={styles.panelCardTitle}>{tr('session.corrections_tab')}</Text>
            <Text style={styles.panelCardMeta}>
              {corrections.length === 0 ? tr('session.corrections_empty') : tr('session.corrections_count').replace('{count}', String(corrections.length))}
            </Text>
          </Pressable>
          <Pressable style={styles.panelCard} onPress={() => openSheet('transcript')}>
            <Text style={styles.panelCardTitle}>{tr('session.transcript_tab')}</Text>
            <Text style={styles.panelCardMeta}>
              {messages.length === 0 ? tr('session.transcript_empty') : tr('session.transcript_count').replace('{count}', String(messages.length))}
            </Text>
          </Pressable>
        </View>
      </View>

      <BottomSheet
        tr={tr}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        corrections={corrections}
        messages={messages}
        onPlayCorrection={playCorrection}
      />
    </View>
  )
}

