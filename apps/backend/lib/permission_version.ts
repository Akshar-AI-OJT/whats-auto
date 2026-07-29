import type { AccessTokenClaims } from '#types/access_token'

export type PermissionVersionFailure =
  'MISSING_GRANT' | 'SUBJECT_MISMATCH' | 'ORG_MISMATCH' | 'STALE_VERSION' | 'MISSING_PV'

export type PermissionVersionCheckResult =
  { ok: true } | { ok: false; reason: PermissionVersionFailure }

export type TenantGrantRow = {
  id: string
  userId: string
  organizationId: string
  permissionVersion: number
}

export type PlatformGrantRow = {
  userId: string
  permissionVersion: number
}

/**
 * Compare tenant Bearer claims against the authoritative organization_members row.
 */
export function checkTenantPermissionVersion(input: {
  claims: Pick<AccessTokenClaims, 'sub' | 'org_id' | 'member_id' | 'pv'>
  member: TenantGrantRow | null
}): PermissionVersionCheckResult {
  const { claims, member } = input

  if (claims.pv === undefined) {
    return { ok: false, reason: 'MISSING_PV' }
  }

  if (!member) {
    return { ok: false, reason: 'MISSING_GRANT' }
  }

  if (member.userId !== claims.sub) {
    return { ok: false, reason: 'SUBJECT_MISMATCH' }
  }

  if (member.organizationId !== claims.org_id || member.id !== claims.member_id) {
    return { ok: false, reason: 'ORG_MISMATCH' }
  }

  if (member.permissionVersion !== claims.pv) {
    return { ok: false, reason: 'STALE_VERSION' }
  }

  return { ok: true }
}

/**
 * Compare platform Bearer claims against the global user_roles row.
 */
export function checkPlatformPermissionVersion(input: {
  claims: Pick<AccessTokenClaims, 'sub' | 'pv'>
  grant: PlatformGrantRow | null
}): PermissionVersionCheckResult {
  const { claims, grant } = input

  if (claims.pv === undefined) {
    return { ok: false, reason: 'MISSING_PV' }
  }

  if (!grant) {
    return { ok: false, reason: 'MISSING_GRANT' }
  }

  if (grant.userId !== claims.sub) {
    return { ok: false, reason: 'SUBJECT_MISMATCH' }
  }

  if (grant.permissionVersion !== claims.pv) {
    return { ok: false, reason: 'STALE_VERSION' }
  }

  return { ok: true }
}
