/**
 * Home tab — scenario selection screen.
 * 首页标签页 — 场景选择界面。
 */

import { useRouter } from 'expo-router'

import { scenarios } from '@meteorvoice/shared'

import { HomeScreen } from '../../src/screens/HomeScreen'
import { useSession } from '../../src/SessionContext'

export default function HomeTab() {
  const { tr, locale } = useSession()
  const router = useRouter()

  return (
    <HomeScreen
      tr={tr}
      locale={locale}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scenarios={scenarios as any}
      onGoToSession={() => router.replace('/(tabs)/session')}
    />
  )
}
