/**
 * Settings tab — app settings and preferences screen.
 * 设置标签页 — 应用设置与偏好界面。
 */

import { useMobileAuth } from '../../src/mobileAuth'
import { SettingsScreen } from '../../src/screens/SettingsScreen'
import { useSession } from '../../src/SessionContext'

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
