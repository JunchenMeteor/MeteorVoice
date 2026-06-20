import { Stack } from 'expo-router'
import App from '../src/App'

/**
 * Root layout — wraps all routes in ThemeProvider + LogProvider + SessionContext.
 *
 * Stack navigator provides:
 *   - Back stack: push/pop with native header back button
 *   - Transition animations: platform-native (slide on iOS, fade on Android)
 *   - Deep links: meteorvoice://(tabs)/session → opens session tab
 */
export default function RootLayout() {
  return (
    <App>
      <Stack
        screenOptions={{
          headerShown: false,        // tabs manage their own UI
          animation: 'slide_from_right', // iOS-style push animation
          gestureEnabled: true,      // swipe-back gesture
        }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
    </App>
  )
}
