/**
 * History tab — session history and review screen.
 * 历史标签页 — 会话历史与回顾界面。
 */

import {
  useCallback,
  useState,
} from 'react'
import { useFocusEffect } from 'expo-router'

import { HistoryScreen } from '../../src/screens/HistoryScreen'
import { useSession } from '../../src/SessionContext'

export default function HistoryTab() {
  const { tr, locale, api, auth, handleUnauthorized } = useSession()
  const [focusVersion, setFocusVersion] = useState(0)

  useFocusEffect(useCallback(() => {
    setFocusVersion(value => value + 1)
  }, []))

  return (
    <HistoryScreen
      tr={tr}
      locale={locale}
      api={api}
      authState={auth.state}
      authUserId={auth.user?.id ?? null}
      handleUnauthorized={handleUnauthorized}
      refreshKey={focusVersion}
    />
  )
}
