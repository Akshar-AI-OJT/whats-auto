import { createHash } from 'node:crypto'
import {
  PERMISSIONS,
  PLATFORM_PERMISSIONS,
  PRODUCT_PERMISSIONS,
  type Permission,
} from '#abilities/permissions'
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
 * owner / superadmin expand from in-memory catalogs (tokens omit their full scope).
 */
export function permissionsFromClaims(
  claims: Pick<AccessTokenClaims, 'role' | 'scope'>
): Set<Permission> {
  if (claims.role === 'owner') return new Set(PRODUCT_PERMISSIONS)
  if (claims.role === 'superadmin') return new Set(PLATFORM_PERMISSIONS)
  return parseScope(claims.scope)
}

/**
 * Stable short hash of the effective permission set (role + scope material).
 * Reserved for Phase 7 revocation; minted now so claim shape stays fixed.
 */
export function computePermissionVersion(role: string | undefined, scope: string): string {
  let material = scope
  if (role === 'owner') {
    material = formatScope(PRODUCT_PERMISSIONS)
  } else if (role === 'superadmin') {
    material = formatScope(PLATFORM_PERMISSIONS)
  }
  return createHash('sha256')
    .update(`${role ?? ''}|${material}`)
    .digest('hex')
    .slice(0, 16)
}
