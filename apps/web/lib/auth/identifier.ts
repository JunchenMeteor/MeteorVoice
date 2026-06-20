/**
 * Login identifier parsing (phone/email/username). / 登录标识解析（手机号/邮箱/用户名）。
 */
export const defaultUsernameEmailDomain = 'users.meteorvoice.local'

export type LoginIdentifier =
  | { kind: 'phone'; phone: string }
  | { kind: 'email'; email: string }
  | { kind: 'username'; email: string; username: string }

export function usernameEmailDomain() {
  return process.env.NEXT_PUBLIC_METEORVOICE_USERNAME_EMAIL_DOMAIN?.trim() || defaultUsernameEmailDomain
}

export function normalizePhoneIdentifier(value: string) {
  const compact = value.replace(/[\s-]/g, '')
  if (/^\+?[1-9]\d{7,14}$/.test(compact)) {
    return compact.startsWith('+') ? compact : `+86${compact}`
  }
  return null
}

export function usernameToInternalEmail(username: string) {
  return `${username.toLowerCase()}@${usernameEmailDomain()}`
}

export function parseLoginIdentifier(value: string): LoginIdentifier | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const phone = normalizePhoneIdentifier(trimmed)
  if (phone) return { kind: 'phone', phone }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { kind: 'email', email: trimmed.toLowerCase() }
  }

  if (/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,19}$/.test(trimmed)) {
    const username = trimmed.toLowerCase()
    return { kind: 'username', username, email: usernameToInternalEmail(username) }
  }

  return null
}
