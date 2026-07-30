import db from '@adonisjs/lucid/services/db'
import { AuthorizationService } from '#services/authorization_service'
import { computePermissionVersion, formatScope } from '#lib/access_token_permissions'
import type { AccessTokenPayload } from '#types/access_token'

type SessionUser = {
  id: string
  email: string
  name: string
}

type SessionRow = {
  id: string
  activeOrganizationId?: string | null
}

/**
 * Builds JWT claim payloads for the Better Auth jwt plugin definePayload hook.
 * Claims are always derived server-side from membership + AuthorizationService.
 */
export class AccessTokenClaimsService {
  constructor(private authz = new AuthorizationService()) {}

  async build(input: { user: SessionUser; session: SessionRow }): Promise<AccessTokenPayload> {
    const { user, session } = input

    const base: AccessTokenPayload = {
      sub: user.id,
      sid: session.id,
      token_use: 'access',
      email: user.email,
      name: user.name,
      scope: '',
      pv: computePermissionVersion(undefined, ''),
    }

    // Prefer DB over session payload — cookie cache can omit activeOrganizationId.
    const sessionRow = await db
      .from('sessions')
      .where('id', session.id)
      .select('activeOrganizationId')
      .first()

    const orgId =
      (sessionRow?.activeOrganizationId as string | null | undefined) ??
      session.activeOrganizationId ??
      null

    if (orgId) {
      const member = await db
        .from('organization_members as m')
        .innerJoin('roles as r', 'r.id', 'm.roleId')
        .where('m.organizationId', orgId)
        .where('m.userId', user.id)
        .select('m.id', 'm.roleId', 'r.name as role')
        .first()

      if (member) {
        const role = member.role as string
        const roleId = member.roleId as string
        const permissions = await this.authz.resolvePermissions(orgId, roleId)

        // owner/superadmin: omit full catalog from the token; middleware expands.
        const scope = role === 'owner' || role === 'superadmin' ? '' : formatScope(permissions)

        return {
          ...base,
          org_id: orgId,
          member_id: member.id as string,
          role_id: roleId,
          role,
          scope,
          pv: computePermissionVersion(role, scope),
        }
      }
    }

    // No usable tenant membership — still grant platform role when globally superadmin.
    const platform = await this.authz.resolvePlatformPermissionsForUser(user.id)
    if (platform.size > 0) {
      return {
        ...base,
        role: 'superadmin',
        scope: '',
        pv: computePermissionVersion('superadmin', ''),
      }
    }

    return base
  }
}
