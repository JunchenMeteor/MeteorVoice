'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { scenarios, pickRandomAccent } from '@/lib/scenarios'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/components/LanguageProvider'

export default function HomePage() {
  const router = useRouter()
  const t = useT()
  const [userEmail, setUserEmail] = useState<string | null | undefined>(undefined)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const loginCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setAuthError('')
    setAuthLoading(true)
    const supabase = createClient()
    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) { setAuthError(error.message); return }
        setAuthError('Check your email for the confirmation link.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) { setAuthError(error.message); return }
      }
    } catch {
      setAuthError('Connection failed')
    } finally {
      setAuthLoading(false)
    }
  }

  function startSession(scenarioKey: string) {
    const accent = pickRandomAccent()
    router.push(`/session?scenario=${scenarioKey}&accent=${accent.key}`)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--theme-text-primary)]">{t('home.title')}</h1>
        <p className="text-sm text-[var(--theme-text-secondary)] mt-1">
          {t('home.subtitle')}
        </p>
      </div>

      {userEmail === null && (
        <div ref={loginCardRef} className="data-panel p-6 max-w-md">
          <h2 className="text-lg font-semibold text-[var(--theme-text-primary)] mb-1">
            {authMode === 'signin' ? t('login.welcome') : t('login.signup')}
          </h2>
          <p className="text-xs text-[var(--theme-text-secondary)] mb-4">
            {authMode === 'signin' ? 'Sign in to save your progress and preferences' : 'Create an account to get started'}
          </p>
          <form onSubmit={handleAuth} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--theme-bg)] border-[var(--theme-border)] text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-muted)]"
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('login.password')}
              required
              minLength={6}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--theme-bg)] border-[var(--theme-border)] text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-muted)]"
            />
            {authError && (
              <p className={`text-xs ${authError.includes('Check your email') ? 'text-[var(--theme-success)]' : 'text-[var(--theme-danger)]'}`}>
                {authError}
              </p>
            )}
            <button
              type="submit"
              disabled={authLoading}
              className="w-full rounded-lg py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--theme-accent)' }}
            >
              {authLoading ? '...' : authMode === 'signin' ? t('login.signin') : t('login.signup')}
            </button>
          </form>
          <p className="text-xs text-[var(--theme-text-muted)] mt-3 text-center">
            {authMode === 'signin' ? t('login.switch_signup') : t('login.switch_signin')}{' '}
            <button
              type="button"
              onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setAuthError('') }}
              className="font-medium text-[var(--theme-accent)] hover:underline"
            >
              {authMode === 'signin' ? t('login.signup') : t('login.signin')}
            </button>
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {scenarios.map(s => (
          <button
            key={s.key}
            type="button"
            onClick={() => startSession(s.key)}
            className="data-panel p-5 text-left hover:ring-2 hover:ring-[var(--theme-accent)] transition-all cursor-pointer"
          >
            <div className="text-2xl mb-3">{s.icon}</div>
            <h3 className="font-semibold text-[var(--theme-text-primary)]">{s.name}</h3>
            <p className="text-xs text-[var(--theme-accent)] mt-0.5">{s.nameZh}</p>
            <p className="text-sm text-[var(--theme-text-secondary)] mt-2">{s.description}</p>
            <span className="inline-block chip-action mt-3">{s.difficulty}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
