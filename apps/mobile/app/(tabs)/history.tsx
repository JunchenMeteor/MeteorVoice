/**
 * History tab — session history and review screen.
 * 历史标签页 — 会话历史与回顾界面。
 */

import { useMobileAuth } from '../../src/mobileAuth'
import { HistoryScreen } from '../../src/screens/HistoryScreen'
import { useSession } from '../../src/SessionContext'

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
