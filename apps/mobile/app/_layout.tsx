/**
 * Root Stack layout — back stack, deep links, slide transitions.
 * 根 Stack 布局 — 返回栈、深链接 (meteorvoice://)、平台原生滑动转场。
 *
 * ThemeProvider, LogProvider, and SessionContext are provided by App.tsx.
 */
import { Stack } from 'expo-router'
import App from '../src/App'

export default function RootLayout() {
  return (
    <App>
      <Stack screenOptions={{ animation: 'slide_from_right', gestureEnabled: true, headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </App>
  )
}
