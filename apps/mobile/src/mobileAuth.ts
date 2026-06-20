/**
 * Mobile authentication hook (Supabase).
 * 移动端登录鉴权 Hook。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Settings } from 'react-native'
import { createClient } from '@supabase/supabase-js'
import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
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
const authStorageKey = 'meteorvoice-mobile-supabase-auth'
const installMarkerKey = 'meteorvoice.installation_marker.v1'
const installMarkerValue = 'installed'

let shouldClearPersistedAuth = false
if (Platform.OS === 'ios' && Settings.get(installMarkerKey) !== installMarkerValue) {
  shouldClearPersistedAuth = true
  Settings.set({ [installMarkerKey]: installMarkerValue })
}

const secureStorage = {
  getItem: async (key: string) => {
    if (shouldClearPersistedAuth && key === authStorageKey) {
      shouldClearPersistedAuth = false
      await SecureStore.deleteItemAsync(key)
      return null
    }
    return SecureStore.getItemAsync(key)
  },
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export function useMobileAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [state, setState] = useState<AuthState>(supabaseUrl && supabaseAnonKey ? 'loading' : 'unconfigured')
  const [message, setMessage] = useState<string | null>(null)
  const sessionRef = useRef<Session | null>(null)

  const client = useMemo<SupabaseClient | null>(() => {
    if (!supabaseUrl || !supabaseAnonKey) return null

    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storageKey: authStorageKey,
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

      sessionRef.current = data.session
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setState(data.session ? 'signed-in' : 'signed-out')
    })

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      sessionRef.current = nextSession
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

      sessionRef.current = result.data.session
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

  const signOut = useCallback(async (nextMessage: string | null = null) => {
    if (!client) return
    setState('loading')
    await client.auth.signOut()
    sessionRef.current = null
    setSession(null)
    setUser(null)
    setState('signed-out')
    setMessage(nextMessage)
  }, [client])

  const refreshSession = useCallback(async () => {
    if (!client) {
      setState('unconfigured')
      setMessage('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to enable mobile auth.')
      return false
    }

    const currentSession = sessionRef.current
    if (!currentSession?.access_token) {
      const { data, error } = await client.auth.getSession()
      if (error) {
        setMessage(error.message)
        setState('error')
        return false
      }
      sessionRef.current = data.session
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setState(data.session ? 'signed-in' : 'signed-out')
      return Boolean(data.session?.access_token)
    }

    const expiresAtMs = currentSession.expires_at ? currentSession.expires_at * 1000 : 0
    if (!expiresAtMs || expiresAtMs - Date.now() > 60_000) {
      return true
    }

    const { data, error } = await client.auth.refreshSession(currentSession)
    if (error) {
      sessionRef.current = null
      setSession(null)
      setUser(null)
      setState('signed-out')
      setMessage(error.message)
      return false
    }

    sessionRef.current = data.session
    setSession(data.session)
    setUser(data.session?.user ?? null)
    setState(data.session ? 'signed-in' : 'signed-out')
    setMessage(null)
    return Boolean(data.session?.access_token)
  }, [client])

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
    await refreshSession()
    return sessionRef.current?.access_token ? { Authorization: `Bearer ${sessionRef.current.access_token}` } : {}
  }, [refreshSession])

  return {
    getAuthHeaders,
    message,
    refreshSession,
    session,
    signOut,
    state,
    submit,
    user,
  }
}
