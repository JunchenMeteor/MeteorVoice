import { useSession } from '../../src/SessionContext'
import { HistoryScreen } from '../../src/screens/HistoryScreen'
import { useMobileAuth } from '../../src/mobileAuth'

export default function HistoryTab() {
  const { tr, locale, api } = useSession()
  const auth = useMobileAuth()

  return (
    <HistoryScreen
      tr={tr}
      locale={locale}
      api={api}
      getAuthHeaders={auth.getAuthHeaders}
      handleUnauthorized={() => auth.signOut(null)}
      defaultApiBaseUrl=""
    />
  )
}
