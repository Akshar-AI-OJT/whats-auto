import db from '@adonisjs/lucid/services/db'

import { ALL_PERMISSIONS, fromPermissionJson, type Permission } from '#abilities/permissions'

export type ActiveMember = {
  id: string
  organizationId: string
  userId: string
  role: string
}

export class AuthorizationService {
  /**
   * Resolve the complete set of permissions for a member.
   * owner → ALL_PERMISSIONS (short-circuit, no DB call)
   * others → parse organization_roles.permission JSON
   */
  async resolvePermissions(organizationId: string, role: string): Promise<Set<Permission>> {
    if (role === 'owner') {
      return new Set(ALL_PERMISSIONS)
    }

    const row = await db
      .from('organization_roles')
      .where('organizationId', organizationId)
      .where('role', role)
      .select('permission')
      .first()

    if (!row) return new Set()

    const parsed = JSON.parse(row.permission) as Record<string, string[]>
    return new Set(fromPermissionJson(parsed))
  }
  /**
   * Check a single permission against a resolved set.
   * The Set is resolved once per request (in tenant middleware) and cached there.
   */
  can(permissions: Set<Permission>, permission: Permission): boolean {
    return permissions.has(permission)
  }

  /**
   * Validate that a manager's permission set is a superset of
   * the permissions they want to grant. Enforces no-escalation rule.
   */
  canGrant(managerPermissions: Set<Permission>, permissionsToGrant: Permission[]): boolean {
    return permissionsToGrant.every((p) => managerPermissions.has(p))
  }
}
