'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/components/LanguageProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const t = useT()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) { setError(signUpError.message); return }
        setError('Check your email for the confirmation link.')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) { setError(signInError.message); return }
        router.push('/')
        router.refresh()
      }
    } catch {
      setError('Connection failed. Is Supabase running?')
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
            {isSignUp ? 'Sign up to start practicing' : 'Sign in to your coach'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">{t('login.email')}</label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
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

            {error && (
              <p className={`text-sm ${error.includes('Check your email') ? 'text-[var(--theme-success)]' : 'text-[var(--theme-danger)]'}`}>
                {error}
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
              onClick={() => { setIsSignUp(!isSignUp); setError('') }}
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
