import { useSession } from '../../src/SessionContext'
import { HomeScreen } from '../../src/screens/HomeScreen'
import { scenarios } from '@meteorvoice/shared'
import { useRouter } from 'expo-router'

export default function HomeTab() {
  const { tr, locale, selectScenario, selectedScenarioKey, isSessionActive, scenarioSwitching } = useSession()
  const router = useRouter()

  return (
    <HomeScreen
      tr={tr}
      locale={locale}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scenarios={scenarios as any}
      appVersion=""
      defaultApiBaseUrl=""
      onGoToSession={() => router.replace('/(tabs)/session')}
    />
  )
}
