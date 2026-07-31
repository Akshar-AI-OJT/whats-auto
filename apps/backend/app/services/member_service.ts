import db from '@adonisjs/lucid/services/db'
import { AuthorizationService } from '#services/authorization_service'
import type { Permission } from '#abilities/permissions'
import RoleException from '#exceptions/role_exception'
import { resolveAssignableRoleForOrg } from '#services/role_service'
import { DateTime } from 'luxon'

export class MemberService {
  /**
   * Reassign a member's role.
   * Validates: manager holds all permissions of the new role.
   * Dual-writes organization_members + user_roles.
   */
  async assignRole(params: {
    organizationId: string
    memberId: string
    newRole: string
    actorUserId: string
    managerPermissions: Set<Permission>
    actorMemberId: string
  }) {
    const { organizationId, memberId, newRole, actorUserId, managerPermissions, actorMemberId } =
      params

    if (memberId === actorMemberId) throw new Error('Cannot change your own role')
    if (newRole === 'owner') throw RoleException.cannotAssignOwner()

    const role = await resolveAssignableRoleForOrg(organizationId, newRole)

    const authz = new AuthorizationService()
    const rolePermissions = await authz.resolvePermissions(organizationId, role.id)
    if (!authz.canGrant(managerPermissions, [...rolePermissions])) {
      throw new Error('Cannot assign a role with permissions you do not hold')
    }

    const member = await db
      .from('organization_members as m')
      .innerJoin('roles as r', 'r.id', 'm.roleId')
      .where('m.id', memberId)
      .where('m.organizationId', organizationId)
      .select('m.userId', 'r.name as role')
      .firstOrFail()

    if (member.role === 'owner') {
      throw new Error('Cannot change the Owner role directly. Use ownership transfer.')
    }

    await db.transaction(async (trx) => {
      await trx.rawQuery(
        `UPDATE "organization_members"
         SET "roleId" = ?, "permissionVersion" = "permissionVersion" + 1
         WHERE "id" = ?`,
        [role.id, memberId]
      )

      await trx
        .from('user_roles')
        .where('userId', member.userId)
        .where('organizationId', organizationId)
        .update({ roleId: role.id })

      await trx.table('authorization_audits').insert({
        organizationId,
        actorUserId,
        targetType: 'member',
        targetId: memberId,
        eventType: 'member.role_assigned',
        before: JSON.stringify({ role: member.role }),
        after: JSON.stringify({ role: newRole }),
      })
    })
  }

  /**
   * Remove a member from the organization.
   * Cannot remove the Owner. Dual-deletes organization_members + user_roles.
   */
  async removeMember(params: { organizationId: string; memberId: string; actorUserId: string }) {
    const { organizationId, memberId, actorUserId } = params

    const member = await db
      .from('organization_members as m')
      .innerJoin('roles as r', 'r.id', 'm.roleId')
      .where('m.id', memberId)
      .where('m.organizationId', organizationId)
      .where('m.isDeleted', false)
      .select('m.userId', 'r.name as role')
      .firstOrFail()

    if (member.role === 'owner') {
      throw new Error('Cannot remove the Owner. Transfer ownership first.')
    }

    await db.transaction(async (trx) => {
      await trx.from('organization_members').where('id', memberId).update({
        isDeleted: true,
        deletedAt: DateTime.utc().toSQL(),
      })

      await trx.table('authorization_audits').insert({
        organizationId,
        actorUserId,
        targetType: 'member',
        targetId: memberId,
        eventType: 'member.removed',
        before: JSON.stringify({
          memberId,
          userId: member.userId,
          role: member.role,
        }),
      })
    })
  }
}
