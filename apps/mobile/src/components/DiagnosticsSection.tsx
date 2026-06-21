/**
 * Voice diagnostics settings section.
 * 语音诊断设置区块。
 */

import {
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native'

type DiagnosticsSectionStyles = {
  card: StyleProp<ViewStyle>
  cardHeader: StyleProp<ViewStyle>
  cardTitle: StyleProp<TextStyle>
  chipRow: StyleProp<ViewStyle>
  diagnosticsBox: StyleProp<ViewStyle>
  diagnosticsText: StyleProp<TextStyle>
  smallBtn: StyleProp<ViewStyle>
  smallBtnTxt: StyleProp<TextStyle>
}

interface DiagnosticsSectionProps {
  asrEvaluationText: string
  onClearVoiceMetrics: () => void
  onShareASREvaluation: () => void
  onShareVoiceMetrics: () => void
  styles: DiagnosticsSectionStyles
  voiceMetricsText: string
}

export function DiagnosticsSection({
  asrEvaluationText,
  onClearVoiceMetrics,
  onShareASREvaluation,
  onShareVoiceMetrics,
  styles,
  voiceMetricsText,
}: DiagnosticsSectionProps) {
  return (
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
  )
}
