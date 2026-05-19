'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { parseLoginIdentifier } from '@/lib/auth/identifier'
import { useT } from '@/components/LanguageProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const t = useT()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'error' | 'success'>('error')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setMessageType('error')
    const parsed = parseLoginIdentifier(identifier)
    if (!parsed) {
      setMessage(t('login.error_invalid_account'))
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      const authValue = parsed.kind === 'phone' ? parsed.phone : parsed.email
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp(
          parsed.kind === 'phone'
            ? { phone: authValue, password }
            : {
                email: authValue,
                password,
                options: {
                  data: {
                    username: parsed.kind === 'username' ? parsed.username : undefined,
                    display_name: parsed.kind === 'username' ? parsed.username : undefined,
                  },
                },
              },
        )
        if (signUpError) { setMessage(signUpError.message); return }
        setMessageType('success')
        setMessage(parsed.kind === 'phone' ? t('login.signup_phone_success') : t('login.signup_email_success'))
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword(
          parsed.kind === 'phone'
            ? { phone: authValue, password }
            : { email: authValue, password },
        )
        if (signInError) { setMessage(signInError.message); return }
        router.push('/')
        router.refresh()
      }
    } catch {
      setMessage(t('login.error_connection'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-full p-6" style={{ background: 'var(--theme-bg)' }}>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{isSignUp ? t('login.signup') : t('login.welcome')}</CardTitle>
          <CardDescription>
            {isSignUp ? t('login.signup_desc') : t('login.signin_desc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">{t('login.account')}</label>
              <Input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder={t('login.account_placeholder')}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">{t('login.password')}</label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            {message && (
              <p className={`text-sm ${messageType === 'success' ? 'text-[var(--theme-success)]' : 'text-[var(--theme-danger)]'}`}>
                {message}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('login.loading') : isSignUp ? t('login.signup') : t('login.signin')}
            </Button>
          </form>

          <p className="text-xs text-[var(--theme-text-muted)] mt-4 text-center">
            {isSignUp ? t('login.switch_signin') : t('login.switch_signup')}{' '}
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setMessage(''); setMessageType('error') }}
              className="font-medium text-[var(--theme-accent)] hover:underline"
            >
              {isSignUp ? t('login.signin') : t('login.signup')}
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
