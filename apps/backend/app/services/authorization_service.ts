import db from '@adonisjs/lucid/services/db'
import { PLATFORM_PERMISSIONS, PRODUCT_PERMISSIONS, type Permission } from '#abilities/permissions'

export type ActiveMember = {
  id: string
  organizationId: string
  userId: string
  roleId: string
  role: string
}

export class AuthorizationService {
  /**
   * Resolve the complete set of permissions for a member.
   * owner → PRODUCT_PERMISSIONS (short-circuit)
   * superadmin → PLATFORM_PERMISSIONS (short-circuit)
   * others → role_permissions ± organization_role_permissions overrides
   */
  async resolvePermissions(organizationId: string, roleId: string): Promise<Set<Permission>> {
    const role = await db.from('roles').where('id', roleId).select('name').first()
    if (!role) return new Set()
    if (role.name === 'owner') return new Set(PRODUCT_PERMISSIONS)
    if (role.name === 'superadmin') return new Set(PLATFORM_PERMISSIONS)

    const base = await db
      .from('role_permissions as rp')
      .innerJoin('permissions as p', 'p.id', 'rp.permissionId')
      .where('rp.roleId', roleId)
      .select('p.name')

    const overrides = await db
      .from('organization_role_permissions as orp')
      .innerJoin('permissions as p', 'p.id', 'orp.permissionId')
      .where('orp.organizationId', organizationId)
      .where('orp.roleId', roleId)
      .select('p.name', 'orp.granted')

    const permissions = new Set(base.map((r) => r.name as Permission))
    for (const o of overrides) {
      if (o.granted) permissions.add(o.name as Permission)
      else permissions.delete(o.name as Permission)
    }
    return permissions
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
