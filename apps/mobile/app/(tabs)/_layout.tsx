/**
 * Tab layout — 4-tab bottom navigator replacing manual TabBar.
 * Tab 布局 — 4 个标签的底部导航，替代原来的手工 TabBar。
 * Icons from MaterialCommunityIcons (replaces hand-drawn View primitives).
 */
import { Tabs } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme } from '../../src/ThemeProvider'

export default function TabLayout() {
  const { C } = useTheme()

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: C.accent,
      tabBarInactiveTintColor: C.textMuted,
      tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.border },
    }}>
      <Tabs.Screen name="session"  options={{ title: 'Practice', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="microphone" size={size} color={color} /> }} />
      <Tabs.Screen name="home"     options={{ title: 'Home',     tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="home"        size={size} color={color} /> }} />
      <Tabs.Screen name="history"  options={{ title: 'History',  tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="history"     size={size} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="cog"         size={size} color={color} /> }} />
    </Tabs>
  )
}
