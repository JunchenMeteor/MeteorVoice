import { useSession } from '../../src/SessionContext'
import { SettingsScreen } from '../../src/screens/SettingsScreen'
import { useMobileAuth } from '../../src/mobileAuth'

export default function SettingsTab() {
  const { tr, locale, setLocale } = useSession()
  const auth = useMobileAuth()

  return (
    <SettingsScreen
      tr={tr}
      locale={locale}
      appVersion=""
      defaultApiBaseUrl=""
      auth={auth}
      signOut={(m) => auth.signOut(m)}
      handleUnauthorized={() => auth.signOut(null)}
      getAuthHeaders={auth.getAuthHeaders}
      onLocaleChange={setLocale}
    />
  )
}
