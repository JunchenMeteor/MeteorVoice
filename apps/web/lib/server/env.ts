export function requireEnv(name: string, label?: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required${label ? ` for ${label}` : ''}`)
  return value
}
