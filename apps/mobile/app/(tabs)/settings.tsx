/**
 * Settings tab — app settings and preferences screen.
 * 设置标签页 — 应用设置与偏好界面。
 */

import { SettingsScreen } from '../../src/screens/SettingsScreen'
import { useSession } from '../../src/SessionContext'

export default function SettingsTab() {
  const {
    appVersion,
    auth,
    defaultApiBaseUrl,
    getAuthHeaders,
    handleUnauthorized,
    locale,
    setLocale,
    signOut,
    tr,
  } = useSession()

  return (
    <SettingsScreen
      tr={tr}
      locale={locale}
      appVersion={appVersion}
      defaultApiBaseUrl={defaultApiBaseUrl}
      auth={auth}
      signOut={signOut}
      handleUnauthorized={handleUnauthorized}
      getAuthHeaders={getAuthHeaders}
      onLocaleChange={setLocale}
    />
  )
}
