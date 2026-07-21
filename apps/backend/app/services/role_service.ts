import db from '@adonisjs/lucid/services/db'
import { toStoredPermissionJson, fromPermissionJson, type Permission } from '#abilities/permissions'
import { AuthorizationService } from '#services/authorization_service'
import RoleException from '#exceptions/role_exception'

/** Static Better Auth role — never stored in organization_roles. */
export const RESERVED_ROLE_KEYS = ['owner'] as const

export function slugifyRoleKey(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export function assertAssignableRoleKey(role: string): void {
  if (!role || role.trim() === '') {
    throw RoleException.invalidKey(role)
  }
  if ((RESERVED_ROLE_KEYS as readonly string[]).includes(role)) {
    throw RoleException.reservedKey(role)
  }
}

export class RoleService {
  /**
   * List all dynamic roles for a tenant.
   */
  async listRoles(organizationId: string) {
    const rows = await db
      .from('organization_roles')
      .where('organizationId', organizationId)
      .select('role', 'displayName', 'permission', 'createdAt', 'updatedAt')
      .orderBy('createdAt', 'asc')

    return rows.map((r) => ({
      ...r,
      permissions: fromPermissionJson(JSON.parse(r.permission)),
    }))
  }

  /**
   * Create a new dynamic role.
   * Validates: manager holds all permissions being granted (no escalation).
   */
  async createRole(params: {
    organizationId: string
    displayName: string
    permissions: Permission[]
    actorUserId: string
    managerPermissions: Set<Permission>
  }) {
    const { organizationId, displayName, permissions, actorUserId, managerPermissions } = params

    const authz = new AuthorizationService()
    if (!authz.canGrant(managerPermissions, permissions)) {
      throw new Error('Cannot grant permissions you do not hold')
    }

    const role = slugifyRoleKey(displayName)
    assertAssignableRoleKey(role)

    await db.transaction(async (trx) => {
      await trx.table('organization_roles').insert({
        organizationId,
        role,
        displayName,
        permission: JSON.stringify(toStoredPermissionJson(permissions)),
      })
      await trx.table('authorization_audit_events').insert({
        organizationId,
        actorUserId,
        targetType: 'role',
        eventType: 'role.created',
        after: JSON.stringify({ role, displayName, permissions }),
      })
    })

    return role
  }

  /**
   * Preview what would change if a role's permissions are updated.
   * Pure read — no mutations.
   */
  async previewRoleUpdate(params: {
    organizationId: string
    roleKey: string
    newPermissions: Permission[]
  }) {
    const { organizationId, roleKey, newPermissions } = params

    if (roleKey === 'owner') throw RoleException.protectedRole('owner')

    const existing = await db
      .from('organization_roles')
      .where('organizationId', organizationId)
      .where('role', roleKey)
      .select('permission', 'displayName')
      .firstOrFail()

    const currentPermissions = fromPermissionJson(JSON.parse(existing.permission))
    const currentSet = new Set(currentPermissions)
    const newSet = new Set(newPermissions)

    const permissionsAdded = newPermissions.filter((p) => !currentSet.has(p))
    const permissionsRemoved = currentPermissions.filter((p) => !newSet.has(p))

    // Count affected members only when there are removals
    let affectedMembers: Array<{ id: string; userId: string }> = []
    if (permissionsRemoved.length > 0) {
      affectedMembers = await db
        .from('organization_members')
        .where('organizationId', organizationId)
        .where('role', roleKey)
        .select('id', 'userId')
    }
    return {
      permissionsAdded,
      permissionsRemoved,
      affectedMembers,
      displayName: existing.displayName,
    }
  }

  /**
   * Update a role's permissions (requires explicit reason for reductions).
   * Validates: manager holds all new permissions.
   */
  async updateRole(params: {
    organizationId: string
    roleKey: string
    newPermissions: Permission[]
    reason: string
    actorUserId: string
    managerPermissions: Set<Permission>
  }) {
    const { organizationId, roleKey, newPermissions, reason, actorUserId, managerPermissions } =
      params

    const authz = new AuthorizationService()
    if (!authz.canGrant(managerPermissions, newPermissions)) {
      throw new Error('Cannot grant permissions you do not hold')
    }
    if (roleKey === 'owner') throw RoleException.protectedRole('owner')

    const existing = await db
      .from('organization_roles')
      .where('organizationId', organizationId)
      .where('role', roleKey)
      .select('permission')
      .firstOrFail()

    await db.transaction(async (trx) => {
      await trx
        .from('organization_roles')
        .where('organizationId', organizationId)
        .where('role', roleKey)
        .update({
          permission: JSON.stringify(toStoredPermissionJson(newPermissions)),
        })

      await trx.table('authorization_audit_events').insert({
        organizationId,
        actorUserId,
        targetType: 'role',
        eventType: 'role.updated',
        before: JSON.stringify({ permission: JSON.parse(existing.permission) }),
        after: JSON.stringify({ permission: toStoredPermissionJson(newPermissions) }),
        reason,
      })
    })
  }

  /**
   * Delete a role. Requires a replacement role for all current members.
   * Reassignment + deletion + audit in one transaction.
   */
  async deleteRole(params: {
    organizationId: string
    roleKey: string
    replacementRole: string
    reason: string
    actorUserId: string
  }) {
    const { organizationId, roleKey, replacementRole, reason, actorUserId } = params

    if (roleKey === 'owner') throw RoleException.protectedRole('owner')
    if (replacementRole === roleKey) throw RoleException.replacementSameAsDeleted()
    assertAssignableRoleKey(replacementRole)

    const replacement = await db
      .from('organization_roles')
      .where('organizationId', organizationId)
      .where('role', replacementRole)
      .select('role')
      .first()

    if (!replacement) {
      throw RoleException.replacementMissing(replacementRole)
    }

    await db.transaction(async (trx) => {
      // Reassign members
      const affected = await trx
        .from('organization_members')
        .where('organizationId', organizationId)
        .where('role', roleKey)
        .update({ role: replacementRole })

      // Delete role
      await trx
        .from('organization_roles')
        .where('organizationId', organizationId)
        .where('role', roleKey)
        .delete()
      // Audit
      await trx.table('authorization_audit_events').insert({
        organizationId,
        actorUserId,
        targetType: 'role',
        eventType: 'role.deleted',
        before: JSON.stringify({ role: roleKey }),
        after: JSON.stringify({ replacementRole, membersReassigned: affected }),
        reason,
      })
    })
  }
}
