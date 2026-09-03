/**
 * Detect PostgreSQL unique_violation (23505), including Knex/Lucid-wrapped errors.
 * Walks `cause` / `original` up to 4 levels.
 */
export function isPostgresUniqueViolation(error: unknown, constraintName?: string): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const row = current as { code?: string; constraint?: string; detail?: string }
    if (row.code === '23505') {
      if (!constraintName) return true
      const constraint = row.constraint?.replaceAll('"', '')
      if (constraint === constraintName) return true
      if (typeof row.detail === 'string' && row.detail.includes(constraintName)) return true
    }
    current = (current as { cause?: unknown }).cause ?? (current as { original?: unknown }).original
  }
  return false
}

/**
 * Extract the column/field name from a Postgres unique_violation detail string.
 * Matches: `Key (slug)=(acme) already exists.`
 */
export function extractUniqueViolationField(detail?: string | null): string | null {
  if (!detail) return null
  const match = detail.match(/Key \(([^)]+)\)=/)
  return match?.[1] ?? null
}

/**
 * Walk nested error objects and return the first Postgres SQLSTATE-shaped error node.
 * SQLSTATE codes are 5 alphanumeric characters (e.g. 23505). Domain exception codes
 * like E_ORG_SLUG_ALREADY_EXISTS are ignored.
 */
export function extractPostgresError(error: unknown): {
  code?: string
  detail?: string
  constraint?: string
} | null {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const row = current as { code?: string; detail?: string; constraint?: string }
    if (typeof row.code === 'string' && /^[0-9A-Z]{5}$/.test(row.code)) {
      return row
    }
    current = (current as { cause?: unknown }).cause ?? (current as { original?: unknown }).original
  }
  return null
}
