/**
 * SMTP passwords and provider API keys: trim edges and remove interior whitespace
 * (e.g. Gmail App Passwords pasted as "abcd efgh ijkl mnop").
 */
export function normalizeMailSecret(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().replace(/\s/g, '')
  return normalized.length > 0 ? normalized : null
}
