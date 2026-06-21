/**
 * Global feedback overlay (loading/error/toast).
 * 全局反馈遮罩。
 */

import { useEffect } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type { AppFeedbackState } from '@meteorvoice/shared'
import { hideAppFeedback } from '@meteorvoice/shared'

import { useTheme } from '../ThemeProvider'

type Props = {
  feedback: AppFeedbackState | null
}

export function AppFeedbackOverlay({ feedback }: Props) {
  const { C } = useTheme()
  useEffect(() => {
    if (!feedback?.active || !feedback.autoDismissMs) return
    const timer = setTimeout(() => {
      hideAppFeedback(feedback.source)
    }, feedback.autoDismissMs)
    return () => clearTimeout(timer)
  }, [feedback?.active, feedback?.autoDismissMs, feedback?.source])

  if (!feedback?.active) return null

  const variant = feedback.variant ?? 'hud'
  const blocksInteraction = feedback.blocksInteraction ?? true
  const styles = StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: variant === 'bar' ? 'transparent' : 'rgba(0,0,0,0.28)',
      alignItems: 'center',
      justifyContent: variant === 'bar' ? 'flex-start' : 'center',
      paddingHorizontal: 24,
      paddingTop: 18,
    },
    surface: {
      minWidth: variant === 'bar' ? '100%' : undefined,
      backgroundColor: C.surface,
      borderRadius: variant === 'bar' ? 8 : 10,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
      flexDirection: variant === 'panel' ? 'column' : 'row',
      gap: 10,
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    message: {
      color: C.textPrimary,
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
    },
    title: {
      color: C.textPrimary,
      fontSize: 15,
      fontWeight: '800',
      textAlign: 'center',
    },
    textStack: {
      gap: 3,
      flexShrink: 1,
    },
  })

  return (
    <View pointerEvents={blocksInteraction ? 'auto' : 'box-none'} style={styles.overlay}>
      <View style={styles.surface}>
        <ActivityIndicator color={C.accent} />
        <View style={styles.textStack}>
          {feedback.title ? <Text style={styles.title}>{feedback.title}</Text> : null}
          <Text style={styles.message}>{feedback.message}</Text>
        </View>
      </View>
    </View>
  )
}
