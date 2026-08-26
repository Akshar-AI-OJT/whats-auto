import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import db from '@adonisjs/lucid/services/db'
import { OrganizationStatus } from '#enums/organization_status'
import type { OrganizationStatusValue } from '#enums/organization_status'
import OrganizationException from '#exceptions/organization_exception'
import { AuthorizationService } from '#services/authorization_service'
import { permissionsFromClaims } from '#lib/access_token_permissions'
import { checkTenantPermissionVersion } from '#lib/permission_version'
import { runWithTenant } from '#services/tenant_context'
import '#types/http'

export type TenantMiddlewareOptions = {
  /**
   * Opt out of the provisioning gate (billing, orgs mutate, access-context).
   * Default is fail-closed: only `active` orgs proceed.
   */
  skipActiveGate?: boolean
}

function asOrganizationStatus(value: unknown): OrganizationStatusValue {
  if (
    value === OrganizationStatus.PENDING_SETUP ||
    value === OrganizationStatus.ACTIVE ||
    value === OrganizationStatus.SUSPENDED ||
    value === OrganizationStatus.FALSE
  ) {
    return value
  }
  // DEFAULT 'active' on the column; treat unexpected/null as active for grandfathered rows.
  return OrganizationStatus.ACTIVE
}

/** Fail-closed product gate: only status === 'active' proceeds (402, not 403). */
function assertOrganizationActive(
  status: string | undefined
): asserts status is typeof OrganizationStatus.ACTIVE {
  if (status !== OrganizationStatus.ACTIVE) {
    throw OrganizationException.paymentRequired()
  }
}

export default class TenantMiddleware {
  async handle(
    { request, response }: HttpContext,
    next: NextFn,
    options: TenantMiddlewareOptions = {}
  ) {
    // Bearer path — hydrate membership + permissions from verified claims.
    if (request.authMethod === 'bearer' && request.accessTokenClaims) {
      const claims = request.accessTokenClaims

      if (!claims.org_id || !claims.member_id || !claims.role_id || !claims.role) {
        return response.forbidden({
          error: 'No active organization. Call POST /api/v1/organizations/:id/set-active first.',
          code: 'NO_ACTIVE_ORG',
        })
      }

      // Freshness check against organization_members.permissionVersion (before RLS stamp).
      // status rides the same query — zero extra round-trips.
      const memberRow = await db
        .from('organization_members as m')
        .innerJoin('organizations as o', 'o.id', 'm.organizationId')
        .where('m.id', claims.member_id)
        .where('m.isDeleted', false)
        .whereNull('o.deletedAt')
        .select('m.id', 'm.userId', 'm.organizationId', 'm.permissionVersion', 'o.status')
        .first()

      const versionCheck = checkTenantPermissionVersion({
        claims,
        member: memberRow
          ? {
              id: memberRow.id as string,
              userId: memberRow.userId as string,
              organizationId: memberRow.organizationId as string,
              permissionVersion: Number(memberRow.permissionVersion),
            }
          : null,
      })

      if (!versionCheck.ok) {
        return response.unauthorized({
          error: 'Access token permissions are stale. Mint a new token.',
          code: 'TOKEN_PERMISSIONS_STALE',
          reason: versionCheck.reason,
        })
      }

      request.activeOrganizationId = claims.org_id
      request.activeMember = {
        id: claims.member_id,
        organizationId: claims.org_id,
        userId: claims.sub,
        roleId: claims.role_id,
        role: claims.role,
      }
      request.organizationStatus = asOrganizationStatus(memberRow?.status)

      try {
        request.memberPermissions = permissionsFromClaims(claims)
      } catch {
        return response.unauthorized({
          error: 'Access token contains unknown permission scopes',
          code: 'UNKNOWN_SCOPE',
        })
      }

      if (!options.skipActiveGate) {
        assertOrganizationActive(request.organizationStatus)
      }

      return runWithTenant(claims.org_id, () => next())
    }

    // Cookie / session path — membership + permissions from DB.
    const orgId = request.activeOrganizationId

    if (!orgId) {
      return response.forbidden({
        error: 'No active organization. Call POST /api/v1/organizations/:id/set-active first.',
        code: 'NO_ACTIVE_ORG',
      })
    }

    const member = await db
      .from('organization_members as m')
      .innerJoin('roles as r', 'r.id', 'm.roleId')
      .innerJoin('organizations as o', 'o.id', 'm.organizationId')
      .where('m.organizationId', orgId)
      .where('m.userId', request.authUser!.id)
      .where('m.isDeleted', false)
      .whereNull('o.deletedAt')
      .select('m.id', 'm.organizationId', 'm.userId', 'm.roleId', 'r.name as role', 'o.status')
      .first()

    if (!member) {
      return response.forbidden({
        error: 'You are not a member of this organization.',
        code: 'NOT_A_MEMBER',
      })
    }

    request.activeMember = {
      id: member.id as string,
      organizationId: member.organizationId as string,
      userId: member.userId as string,
      roleId: member.roleId as string,
      role: member.role as string,
    }
    request.organizationStatus = asOrganizationStatus(member.status)

    const authz = new AuthorizationService()
    request.memberPermissions = await authz.resolvePermissions(orgId, member.roleId as string)

    if (!options.skipActiveGate) {
      assertOrganizationActive(request.organizationStatus)
    }

    // Bind org to ALS for the rest of the request. TenantRlsProvider stamps
    // app.current_organization_id on every connection acquire from this context.
    return runWithTenant(orgId, () => next())
  }
}
