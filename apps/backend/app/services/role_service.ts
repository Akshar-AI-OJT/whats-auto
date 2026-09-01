import db from '@adonisjs/lucid/services/db'
import type { Permission } from '#abilities/permissions'
import { AuthorizationService } from '#services/authorization_service'
import RoleException from '#exceptions/role_exception'
import { bumpMembersByRolePermissionVersion } from '#lib/permission_version_bumps'
import { PlanEnforcementService } from '#services/billing/plan_enforcement_service'

/** Global system roles — blocked from custom-role creation. */
export const SYSTEM_ROLE_NAMES = ['owner', 'superadmin', 'admin', 'agent', 'viewer'] as const

/** Roles that can never be granted via member assignment or invitations. */
export const UNASSIGNABLE_ROLE_NAMES = ['owner', 'superadmin'] as const

const LISTABLE_SYSTEM_ROLES = ['admin', 'agent', 'viewer'] as const

export function slugifyRoleKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export function assertAssignableRoleKey(role: string): void {
  if (!role || role.trim() === '') {
    throw RoleException.invalidKey(role)
  }
  if ((UNASSIGNABLE_ROLE_NAMES as readonly string[]).includes(role)) {
    throw RoleException.reservedKey(role)
  }
}

/** Global system role lookup — used for the owner role at org creation / ownership transfer. */
export async function getGlobalRoleIdByName(name: string): Promise<string> {
  const role = await db
    .from('roles')
    .whereNull('organizationId')
    .where('name', name)
    .select('id')
    .first()
  if (!role) throw new Error(`Global role "${name}" is not seeded`)
  return role.id as string
}

/**
 * Resolve a role name to a row usable for member assignment / invitations:
 * a global system role OR one of this org's custom roles. owner/superadmin rejected.
 */
export async function resolveAssignableRoleForOrg(organizationId: string, name: string) {
  if ((UNASSIGNABLE_ROLE_NAMES as readonly string[]).includes(name)) {
    throw RoleException.reservedKey(name)
  }
  const role = await db
    .from('roles')
    .where('name', name)
    .where((q) => q.whereNull('organizationId').orWhere('organizationId', organizationId))
    .select('id', 'name', 'organizationId')
    .first()
  if (!role) throw new Error(`Role "${name}" does not exist in this organization`)
  return role as { id: string; name: string; organizationId: string | null }
}

type RoleRow = { id: string; name: string; organizationId: string | null }

async function resolveEditableRole(organizationId: string, roleKey: string): Promise<RoleRow> {
  if ((UNASSIGNABLE_ROLE_NAMES as readonly string[]).includes(roleKey)) {
    throw RoleException.protectedRole(roleKey)
  }

  const role = await db
    .from('roles')
    .where('name', roleKey)
    .where((q) => q.whereNull('organizationId').orWhere('organizationId', organizationId))
    .select('id', 'name', 'organizationId')
    .first()

  if (!role) throw new Error(`Role "${roleKey}" does not exist in this organization`)
  return role as RoleRow
}

export class RoleService {
  /**
   * List listable system roles (admin/agent/viewer) plus this org's custom roles,
   * each with effective permissions for the active org.
   */
  async listRoles(organizationId: string) {
    const roles = await db
      .from('roles')
      .where((q) =>
        q
          .where((g) => g.whereNull('organizationId').whereIn('name', [...LISTABLE_SYSTEM_ROLES]))
          .orWhere('organizationId', organizationId)
      )
      .select('id', 'name', 'organizationId')
      .orderBy('name', 'asc')

    if (roles.length === 0) return []

    const roleIds = roles.map((r) => r.id as string)

    const baseRows = await db
      .from('role_permissions as rp')
      .innerJoin('permissions as p', 'p.id', 'rp.permissionId')
      .whereIn('rp.roleId', roleIds)
      .select('rp.roleId', 'p.name')

    const overrideRows = await db
      .from('organization_role_permissions as orp')
      .innerJoin('permissions as p', 'p.id', 'orp.permissionId')
      .where('orp.organizationId', organizationId)
      .whereIn('orp.roleId', roleIds)
      .select('orp.roleId', 'p.name', 'orp.granted')

    const baseByRole = new Map<string, Set<Permission>>()
    for (const row of baseRows) {
      const set = baseByRole.get(row.roleId as string) ?? new Set<Permission>()
      set.add(row.name as Permission)
      baseByRole.set(row.roleId as string, set)
    }

    const overridesByRole = new Map<string, Array<{ name: Permission; granted: boolean }>>()
    for (const row of overrideRows) {
      const list = overridesByRole.get(row.roleId as string) ?? []
      list.push({ name: row.name as Permission, granted: row.granted as boolean })
      overridesByRole.set(row.roleId as string, list)
    }

    return roles.map((r) => {
      const roleId = r.id as string
      const permissions = new Set(baseByRole.get(roleId) ?? [])
      const overrides = overridesByRole.get(roleId) ?? []
      for (const o of overrides) {
        if (o.granted) permissions.add(o.name)
        else permissions.delete(o.name)
      }

      return {
        role: r.name as string,
        isSystem: r.organizationId === null,
        hasOverrides: overrides.length > 0,
        permissions: [...permissions],
      }
    })
  }

  /**
   * Create an org-scoped custom role with direct role_permissions rows.
   */
  async createRole(params: {
    organizationId: string
    name: string
    permissions: Permission[]
    actorUserId: string
    managerPermissions: Set<Permission>
  }) {
    const { organizationId, name, permissions, actorUserId, managerPermissions } = params

    await new PlanEnforcementService().requireFeature(organizationId, 'customRoles')

    const authz = new AuthorizationService()
    if (!authz.canGrant(managerPermissions, permissions)) {
      throw new Error('Cannot grant permissions you do not hold')
    }

    const roleKey = slugifyRoleKey(name)
    if (!roleKey || roleKey.length > 20) {
      throw RoleException.invalidKey(name)
    }
    if ((SYSTEM_ROLE_NAMES as readonly string[]).includes(roleKey)) {
      throw RoleException.reservedKey(roleKey)
    }

    const permissionIds = await this.resolvePermissionIds(permissions)

    const created = await db.transaction(async (trx) => {
      const [role] = await trx
        .table('roles')
        .insert({ organizationId, name: roleKey })
        .returning(['id', 'name'])

      if (permissionIds.length > 0) {
        await trx.table('role_permissions').multiInsert(
          permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          }))
        )
      }

      await trx.table('authorization_audits').insert({
        organizationId,
        actorUserId,
        targetType: 'role',
        targetId: role.id,
        eventType: 'role.created',
        after: JSON.stringify({ role: roleKey, permissions }),
      })

      return roleKey as string
    })

    return created
  }

  /**
   * Preview what would change if a role's permissions are updated.
   */
  async previewRoleUpdate(params: {
    organizationId: string
    roleKey: string
    newPermissions: Permission[]
  }) {
    const { organizationId, roleKey, newPermissions } = params
    const role = await resolveEditableRole(organizationId, roleKey)

    const authz = new AuthorizationService()
    const currentPermissions = [...(await authz.resolvePermissions(organizationId, role.id))]
    const currentSet = new Set(currentPermissions)
    const newSet = new Set(newPermissions)

    const permissionsAdded = newPermissions.filter((p) => !currentSet.has(p))
    const permissionsRemoved = currentPermissions.filter((p) => !newSet.has(p))

    let affectedMembers: Array<{ id: string; userId: string }> = []
    if (permissionsRemoved.length > 0) {
      affectedMembers = await db
        .from('organization_members')
        .where('organizationId', organizationId)
        .where('roleId', role.id)
        .select('id', 'userId')
    }

    return {
      role: roleKey,
      isSystem: role.organizationId === null,
      permissionsAdded,
      permissionsRemoved,
      affectedMembers,
    }
  }

  /**
   * Update role permissions.
   * Custom roles: replace role_permissions rows.
   * Global admin/agent/viewer: upsert/delete organization_role_permissions overrides.
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

    const role = await resolveEditableRole(organizationId, roleKey)
    const desired = new Set(newPermissions)

    if (role.organizationId !== null) {
      await this.updateCustomRolePermissions({
        organizationId,
        role,
        desired,
        reason,
        actorUserId,
      })
      return
    }

    await this.updateGlobalRoleOverrides({
      organizationId,
      role,
      desired,
      reason,
      actorUserId,
    })
  }

  /**
   * Reset a global role's org overrides back to seeded defaults.
   */
  async resetRole(params: {
    organizationId: string
    roleKey: string
    reason: string
    actorUserId: string
  }) {
    const { organizationId, roleKey, reason, actorUserId } = params
    const role = await resolveEditableRole(organizationId, roleKey)

    if (role.organizationId !== null) {
      throw new Error('Only system roles can be reset to defaults')
    }

    const authz = new AuthorizationService()
    const before = [...(await authz.resolvePermissions(organizationId, role.id))]

    await db.transaction(async (trx) => {
      await trx
        .from('organization_role_permissions')
        .where('organizationId', organizationId)
        .where('roleId', role.id)
        .delete()

      await bumpMembersByRolePermissionVersion(trx, organizationId, role.id)

      await trx.table('authorization_audits').insert({
        organizationId,
        actorUserId,
        roleId: role.id,
        targetType: 'role',
        targetId: role.id,
        eventType: 'role.reset',
        before: JSON.stringify({ permissions: before }),
        reason,
      })
    })
  }

  /**
   * Delete a custom role. Reassigns members, user_roles, and invitations first.
   */
  async deleteRole(params: {
    organizationId: string
    roleKey: string
    replacementRole: string
    reason: string
    actorUserId: string
  }) {
    const { organizationId, roleKey, replacementRole, reason, actorUserId } = params

    if ((SYSTEM_ROLE_NAMES as readonly string[]).includes(roleKey)) {
      throw RoleException.protectedRole(roleKey)
    }
    if (replacementRole === roleKey) throw RoleException.replacementSameAsDeleted()

    const role = await resolveEditableRole(organizationId, roleKey)
    if (role.organizationId === null) {
      throw RoleException.protectedRole(roleKey)
    }

    let replacement: { id: string; name: string }
    try {
      replacement = await resolveAssignableRoleForOrg(organizationId, replacementRole)
    } catch {
      throw RoleException.replacementMissing(replacementRole)
    }

    await db.transaction(async (trx) => {
      const membersReassigned = await trx.rawQuery(
        `UPDATE "organization_members"
         SET "roleId" = ?, "permissionVersion" = "permissionVersion" + 1
         WHERE "organizationId" = ? AND "roleId" = ?`,
        [replacement.id, organizationId, role.id]
      )

      const userRolesReassigned = await trx
        .from('user_roles')
        .where('organizationId', organizationId)
        .where('roleId', role.id)
        .update({ roleId: replacement.id })

      const invitationsRepointed = await trx
        .from('organization_invitations')
        .where('organizationId', organizationId)
        .where('roleId', role.id)
        .update({ roleId: replacement.id })

      await trx.from('roles').where('id', role.id).delete()

      await trx.table('authorization_audits').insert({
        organizationId,
        actorUserId,
        targetType: 'role',
        targetId: role.id,
        eventType: 'role.deleted',
        before: JSON.stringify({ role: roleKey }),
        after: JSON.stringify({
          replacementRole,
          membersReassigned: Number(membersReassigned.rowCount ?? 0),
          userRolesReassigned,
          invitationsRepointed,
        }),
        reason,
      })
    })
  }

  private async updateCustomRolePermissions(params: {
    organizationId: string
    role: RoleRow
    desired: Set<Permission>
    reason: string
    actorUserId: string
  }) {
    const { organizationId, role, desired, reason, actorUserId } = params
    const permissionIds = await this.resolvePermissionIds([...desired])

    const existing = await db
      .from('role_permissions as rp')
      .innerJoin('permissions as p', 'p.id', 'rp.permissionId')
      .where('rp.roleId', role.id)
      .select('p.name')

    await db.transaction(async (trx) => {
      await trx.from('role_permissions').where('roleId', role.id).delete()

      if (permissionIds.length > 0) {
        await trx.table('role_permissions').multiInsert(
          permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          }))
        )
      }

      await bumpMembersByRolePermissionVersion(trx, organizationId, role.id)

      await trx.table('authorization_audits').insert({
        organizationId,
        actorUserId,
        roleId: role.id,
        targetType: 'role',
        targetId: role.id,
        eventType: 'role.updated',
        before: JSON.stringify({ permissions: existing.map((r) => r.name) }),
        after: JSON.stringify({ permissions: [...desired] }),
        reason,
      })
    })
  }

  private async updateGlobalRoleOverrides(params: {
    organizationId: string
    role: RoleRow
    desired: Set<Permission>
    reason: string
    actorUserId: string
  }) {
    const { organizationId, role, desired, reason, actorUserId } = params

    const baseRows = await db
      .from('role_permissions as rp')
      .innerJoin('permissions as p', 'p.id', 'rp.permissionId')
      .where('rp.roleId', role.id)
      .select('p.id as permissionId', 'p.name')

    const baseByName = new Map(
      baseRows.map((r) => [r.name as Permission, r.permissionId as string])
    )
    const baseSet = new Set(baseByName.keys())

    const allNames = new Set<Permission>([...baseSet, ...desired])
    const permissionIdByName = new Map(baseByName)

    const missingDesired = [...desired].filter((p) => !permissionIdByName.has(p))
    if (missingDesired.length > 0) {
      const extra = await db
        .from('permissions')
        .whereIn('name', missingDesired)
        .select('id', 'name')
      for (const row of extra) {
        permissionIdByName.set(row.name as Permission, row.id as string)
      }
    }

    type OverrideChange = {
      permissionId: string
      permissionName: Permission
      granted: boolean | null // null = delete override (return to default)
    }

    const changes: OverrideChange[] = []
    for (const name of allNames) {
      const inBase = baseSet.has(name)
      const inDesired = desired.has(name)
      const permissionId = permissionIdByName.get(name)
      if (!permissionId) continue

      if (inDesired === inBase) {
        // Desired matches default — remove any leftover override residue
        changes.push({ permissionId, permissionName: name, granted: null })
      } else if (inDesired && !inBase) {
        changes.push({ permissionId, permissionName: name, granted: true })
      } else if (!inDesired && inBase) {
        changes.push({ permissionId, permissionName: name, granted: false })
      }
    }

    await db.transaction(async (trx) => {
      for (const change of changes) {
        if (change.granted === null) {
          // Desired matches seeded default — drop any leftover override residue
          await trx
            .from('organization_role_permissions')
            .where('organizationId', organizationId)
            .where('roleId', role.id)
            .where('permissionId', change.permissionId)
            .delete()
          continue
        }

        await trx
          .table('organization_role_permissions')
          .insert({
            organizationId,
            roleId: role.id,
            permissionId: change.permissionId,
            granted: change.granted,
          })
          .onConflict(['organizationId', 'roleId', 'permissionId'])
          .merge(['granted'])

        await trx.table('authorization_audits').insert({
          organizationId,
          actorUserId,
          roleId: role.id,
          permissionId: change.permissionId,
          granted: change.granted,
          targetType: 'role',
          targetId: role.id,
          eventType: change.granted ? 'org_role_permission.granted' : 'org_role_permission.revoked',
          after: JSON.stringify({ permission: change.permissionName, granted: change.granted }),
          reason,
        })
      }

      await bumpMembersByRolePermissionVersion(trx, organizationId, role.id)
    })
  }

  private async resolvePermissionIds(permissions: Permission[]): Promise<string[]> {
    if (permissions.length === 0) return []

    const rows = await db.from('permissions').whereIn('name', permissions).select('id', 'name')
    if (rows.length !== permissions.length) {
      const found = new Set(rows.map((r) => r.name as string))
      const missing = permissions.filter((p) => !found.has(p))
      throw new Error(`Unknown permission(s): ${missing.join(', ')}`)
    }
    return rows.map((r) => r.id as string)
  }
}
