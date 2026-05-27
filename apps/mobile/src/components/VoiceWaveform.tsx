import { useEffect, useMemo } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { useTheme } from '../ThemeProvider'

export type WaveformMode = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'paused' | 'ended'

const BAR_HEIGHTS = [18, 32, 44, 54, 44, 32, 18]
const BAR_DELAYS = [0, 80, 160, 240, 160, 80, 0]

// Animated.Value[] is stable across renders — initialized once outside component
const animsRef = BAR_HEIGHTS.map(() => new Animated.Value(1))

export function VoiceWaveform({ mode }: { mode: WaveformMode }) {
  const { C } = useTheme()

  const modeConfig = useMemo(() => ({
    idle:        { color: C.textMuted,  duration: 2800, animate: false, minScale: 0.5,  maxScale: 0.5 },
    listening:   { color: C.success,   duration: 820,  animate: true,  minScale: 0.72, maxScale: 1.18 },
    transcribing:{ color: C.accent,    duration: 1800, animate: true,  minScale: 0.65, maxScale: 1.1 },
    thinking:    { color: C.warning,   duration: 2200, animate: true,  minScale: 0.6,  maxScale: 1.05 },
    speaking:    { color: C.gold,      duration: 640,  animate: true,  minScale: 0.62, maxScale: 1.28 },
    paused:      { color: C.warning,   duration: 2800, animate: false, minScale: 0.5,  maxScale: 0.5 },
    ended:       { color: C.textMuted, duration: 2800, animate: false, minScale: 0.42, maxScale: 0.42 },
  }), [C])

  useEffect(() => {
    const cfg = modeConfig[mode]
    animsRef.forEach(a => a.setValue(cfg.minScale))
    if (!cfg.animate) return
    const loops = animsRef.map((anim, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(BAR_DELAYS[i]),
          Animated.timing(anim, { toValue: cfg.maxScale, duration: cfg.duration / 2, useNativeDriver: true }),
          Animated.timing(anim, { toValue: cfg.minScale, duration: cfg.duration / 2, useNativeDriver: true }),
        ]),
      )
      loop.start()
      return loop
    })
    return () => loops.forEach(l => l.stop())
  }, [mode, modeConfig])

  const cfg = modeConfig[mode]
  return (
    <View style={styles.row}>
      {animsRef.map((anim, i) => (
        <Animated.View key={i} style={[styles.bar, { height: BAR_HEIGHTS[i], backgroundColor: cfg.color, transform: [{ scaleY: anim }] }]} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 60 },
  bar: { width: 5, borderRadius: 999 },
})
