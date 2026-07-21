import db from '@adonisjs/lucid/services/db'
import { AuthorizationService } from '#services/authorization_service'
import type { Permission } from '#abilities/permissions'
import { fromPermissionJson } from '#abilities/permissions'
import RoleException from '#exceptions/role_exception'
import { assertAssignableRoleKey } from '#services/role_service'

export class MemberService {
  /**
   * Reassign a member's role.
   * Validates: manager holds all permissions of the new role.
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
    assertAssignableRoleKey(newRole)

    const roleRow = await db
      .from('organization_roles')
      .where('organizationId', organizationId)
      .where('role', newRole)
      .select('permission')
      .firstOrFail()

    const rolePermissions = fromPermissionJson(JSON.parse(roleRow.permission))

    const authz = new AuthorizationService()
    if (!authz.canGrant(managerPermissions, rolePermissions)) {
      throw new Error('Cannot assign a role with permissions you do not hold')
    }

    const member = await db
      .from('organization_members')
      .where('id', memberId)
      .where('organizationId', organizationId)
      .select('role')
      .firstOrFail()

    if (member.role === 'owner')
      throw new Error('Cannot change the Owner role directly. Use ownership transfer.')

    await db.transaction(async (trx) => {
      await trx.from('organization_members').where('id', memberId).update({ role: newRole })

      await trx.table('authorization_audit_events').insert({
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
   * Cannot remove the Owner.
   */
  async removeMember(params: { organizationId: string; memberId: string; actorUserId: string }) {
    const { organizationId, memberId, actorUserId } = params

    const member = await db
      .from('organization_members')
      .where('id', memberId)
      .where('organizationId', organizationId)
      .select('role', 'userId')
      .firstOrFail()

    if (member.role === 'owner')
      throw new Error('Cannot remove the Owner. Transfer ownership first.')

    await db.transaction(async (trx) => {
      await trx.from('organization_members').where('id', memberId).delete()

      await trx.table('authorization_audit_events').insert({
        organizationId,
        actorUserId,
        targetType: 'member',
        targetId: memberId,
        eventType: 'member.removed',
        before: JSON.stringify({ memberId, userId: member.userId, role: member.role }),
      })
    })
  }
}
