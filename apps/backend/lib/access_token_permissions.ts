import { PERMISSIONS, type Permission } from '#abilities/permissions'
import type { AccessTokenClaims } from '#types/access_token'

export const KNOWN_PERMISSIONS = new Set<string>(Object.values(PERMISSIONS))

export function formatScope(permissions: Iterable<Permission>): string {
  return [...new Set(permissions)].sort().join(' ')
}

/**
 * Parse a space-separated scope string into a permission set.
 * Throws if any token is not in the permission catalog.
 */
export function parseScope(scope: string): Set<Permission> {
  const trimmed = scope.trim()
  if (!trimmed) return new Set()

  const result = new Set<Permission>()
  for (const part of trimmed.split(/\s+/)) {
    if (!KNOWN_PERMISSIONS.has(part)) {
      throw new Error(`Unknown permission in scope: ${part}`)
    }
    result.add(part as Permission)
  }
  return result
}

/**
 * Resolve effective permissions from verified claims.
 * All roles (including owner / superadmin) use the minted `scope` string.
 */
export function permissionsFromClaims(
  claims: Pick<AccessTokenClaims, 'role' | 'scope'>
): Set<Permission> {
  return parseScope(claims.scope)
}
