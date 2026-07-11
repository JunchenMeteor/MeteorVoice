/**
 * Mobile account form state.
 * 移动端账号表单状态。
 */

import {
  useCallback,
  useState,
} from 'react'

import type { TranslateFn } from '@meteorvoice/shared'
import { appFeedback } from '@meteorvoice/shared'

import type { MobileAuthState } from '../mobileAuth'

interface UseAuthFormStateInput {
  auth: MobileAuthState
  tr: TranslateFn
}

export function useAuthFormState({
  auth,
  tr,
}: UseAuthFormStateInput) {
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submitAuth = useCallback(async () => {
    const normalized = email.trim()
    if (!normalized || !password || auth.state === 'loading' || authSubmitting) return
    setAuthSubmitting(true)
    appFeedback.show({ message: tr('login.loading'), variant: 'hud', source: 'auth' })
    try {
      const success = await auth.submit(authMode, normalized, password)
      if (success) setPassword('')
    } finally {
      setAuthSubmitting(false)
      appFeedback.hide('auth')
    }
  }, [auth, authMode, authSubmitting, email, password, tr])

  return {
    authMode,
    authSubmitting,
    email,
    password,
    setAuthMode,
    setEmail,
    setPassword,
    submitAuth,
  }
}
