import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

function resolveEmail(input: string): string {
  const trimmed = input.trim().toLowerCase()
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return trimmed
  return `${trimmed}@users.meteorvoice.local`
}

type AuthMode = 'sign-in' | 'sign-up'
type AuthState = 'unconfigured' | 'loading' | 'signed-out' | 'signed-in' | 'error'

export type MobileAuthState = ReturnType<typeof useMobileAuth>

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export function useMobileAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [state, setState] = useState<AuthState>(supabaseUrl && supabaseAnonKey ? 'loading' : 'unconfigured')
  const [message, setMessage] = useState<string | null>(null)

  const client = useMemo<SupabaseClient | null>(() => {
    if (!supabaseUrl || !supabaseAnonKey) return null

    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: secureStorage,
      },
    })
  }, [])

  useEffect(() => {
    if (!client) return

    let mounted = true

    void client.auth.getSession().then(({ data, error }) => {
      if (!mounted) return

      if (error) {
        setMessage(error.message)
        setState('error')
        return
      }

      setSession(data.session)
      setUser(data.session?.user ?? null)
      setState(data.session ? 'signed-in' : 'signed-out')
    })

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setState(nextSession ? 'signed-in' : 'signed-out')
      setMessage(null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [client])

  const submit = useCallback(async (mode: AuthMode, email: string, password: string) => {
    if (!client) {
      setState('unconfigured')
      setMessage('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to enable mobile auth.')
      return false
    }

    try {
      setState('loading')
      setMessage(null)
      const resolvedEmail = resolveEmail(email)
      const result = mode === 'sign-up'
        ? await client.auth.signUp({ email: resolvedEmail, password })
        : await client.auth.signInWithPassword({ email: resolvedEmail, password })

      if (result.error) {
        setState('signed-out')
        setMessage(result.error.message)
        return false
      }

      setSession(result.data.session)
      setUser(result.data.user)
      setState(result.data.session ? 'signed-in' : 'signed-out')
      setMessage(mode === 'sign-up' && !result.data.session ? 'Check your email to confirm this account.' : null)
      return true
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Authentication failed'
      setState('error')
      setMessage(nextMessage)
      return false
    }
  }, [client])

  const signOut = useCallback(async () => {
    if (!client) return
    setState('loading')
    await client.auth.signOut()
    setSession(null)
    setUser(null)
    setState('signed-out')
  }, [client])

  const getAuthHeaders = useCallback((): HeadersInit => (
    session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
  ), [session])

  return {
    getAuthHeaders,
    message,
    session,
    signOut,
    state,
    submit,
    user,
  }
}
