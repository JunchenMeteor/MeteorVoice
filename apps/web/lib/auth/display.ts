import type { User } from '@supabase/supabase-js'
import { usernameEmailDomain } from './identifier'

type DisplayUser = Pick<User, 'email' | 'phone' | 'user_metadata'>

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function maskPhone(phone: string) {
  const compact = phone.replace(/\s/g, '')
  if (compact.length <= 7) return compact
  return `${compact.slice(0, 3)}****${compact.slice(-4)}`
}

export function isInternalAliasEmail(email?: string | null) {
  if (!email) return false
  return email.toLowerCase().endsWith(`@${usernameEmailDomain().toLowerCase()}`)
}

export function getUserDisplayName(user: DisplayUser | null | undefined) {
  if (!user) return null

  const metadata = user.user_metadata ?? {}
  const displayName = clean(metadata.display_name)
  if (displayName) return displayName

  const username = clean(metadata.username)
  if (username) return username

  const phone = clean(user.phone)
  if (phone) return maskPhone(phone)

  const email = clean(user.email)
  if (email && !isInternalAliasEmail(email)) return email

  return null
}

export function getUserInitial(displayName: string | null | undefined) {
  const trimmed = displayName?.trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?'
}
