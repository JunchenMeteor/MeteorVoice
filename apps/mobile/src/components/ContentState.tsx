import { useMemo } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { useTheme } from '../ThemeProvider'

interface Props {
  actionLabel?: string
  icon?: string
  loading?: boolean
  message?: string
  onAction?: () => void
  title: string
}

export function ContentState({ actionLabel, icon = '○', loading = false, message, onAction, title }: Props) {
  const { C } = useTheme()
  const styles = useMemo(() => StyleSheet.create({
    action: { backgroundColor: C.surface, borderColor: C.border, borderRadius: 9, borderWidth: 1, marginTop: 6, paddingHorizontal: 14, paddingVertical: 9 },
    actionText: { color: C.accent, fontSize: 13, fontWeight: '700' },
    icon: { color: C.textMuted, fontSize: 28, fontWeight: '600' },
    iconSurface: { alignItems: 'center', backgroundColor: C.surface, borderColor: C.border, borderRadius: 28, borderWidth: 1, height: 56, justifyContent: 'center', marginBottom: 10, width: 56 },
    message: { color: C.textMuted, fontSize: 13, lineHeight: 19, maxWidth: 260, textAlign: 'center' },
    root: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
    title: { color: C.textSecondary, fontSize: 15, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  }), [C])

  return (
    <View style={styles.root}>
      <View style={styles.iconSurface}>
        {loading ? <ActivityIndicator color={C.accent} /> : <Text style={styles.icon}>{icon}</Text>}
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.action}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
