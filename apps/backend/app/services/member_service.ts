import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { AuthorizationService } from '#services/authorization_service'
import type { Permission } from '#abilities/permissions'
import RoleException from '#exceptions/role_exception'
import { resolveAssignableRoleForOrg } from '#services/role_service'
import { NotificationService } from '#services/notification_service'
import { DateTime } from 'luxon'

export class MemberService {
  /**
   * Fetch one membership row for authorization / display (excludes soft-deleted).
   */
  async getMemberById(params: { organizationId: string; memberId: string }) {
    const row = await db
      .from('organization_members as m')
      .innerJoin('users as u', 'u.id', 'm.userId')
      .innerJoin('roles as r', 'r.id', 'm.roleId')
      .where('m.id', params.memberId)
      .where('m.organizationId', params.organizationId)
      .where('m.isDeleted', false)
      .select('m.id', 'm.userId', 'm.organizationId', 'r.name as role')
      .first()

    if (!row) return null

    return {
      id: row.id as string,
      userId: row.userId as string,
      organizationId: row.organizationId as string,
      role: row.role as string,
    }
  }

  /**
   * List members of one organization (excludes soft-deleted memberships).
   */
  async listMembers(organizationId: string) {
    const rows = await db
      .from('organization_members as m')
      .innerJoin('users as u', 'u.id', 'm.userId')
      .innerJoin('roles as r', 'r.id', 'm.roleId')
      .where('m.organizationId', organizationId)
      .where('m.isDeleted', false)
      .select('m.id', 'm.createdAt', 'u.id as userId', 'u.name', 'u.email', 'r.name as role')
      .orderBy('u.name', 'asc')

    return rows.map((r) => ({
      id: r.id as string,
      userId: r.userId as string,
      name: r.name as string,
      email: r.email as string,
      role: r.role as string,
      createdAt: r.createdAt as string,
    }))
  }

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

    const oldRole = member.role as string

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

    if (oldRole !== newRole) {
      const workspaceName = await this.#loadOrganizationName(organizationId)
      await this.#notifyMemberBestEffort({
        organizationId,
        userId: member.userId as string,
        actorUserId,
        type: 'team_member_role_changed',
        title: 'Your role was updated',
        body: workspaceName
          ? `Your role in ${workspaceName} changed from ${oldRole} to ${newRole}.`
          : `Your role changed from ${oldRole} to ${newRole}.`,
      })
    }
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

    const workspaceName = await this.#loadOrganizationName(organizationId)
    await this.#notifyMemberBestEffort({
      organizationId,
      userId: member.userId as string,
      actorUserId,
      type: 'team_member_removed',
      title: 'You were removed from this workspace',
      body: workspaceName
        ? `You were removed from ${workspaceName}.`
        : 'You were removed from this workspace.',
    })
  }

  async #loadOrganizationName(organizationId: string): Promise<string | null> {
    const org = await db.from('organizations').where('id', organizationId).select('name').first()
    return (org?.name as string | undefined) ?? null
  }

  /**
   * Best-effort in-app notification for a team member. Never throws.
   */
  async #notifyMemberBestEffort(params: {
    organizationId: string
    userId: string
    actorUserId: string
    type: string
    title: string
    body: string
  }): Promise<void> {
    try {
      await new NotificationService().createNotification({
        organizationId: params.organizationId,
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        actorUserId: params.actorUserId,
      })
    } catch (error) {
      logger.error(
        {
          organizationId: params.organizationId,
          userId: params.userId,
          type: params.type,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'team.notification_failed'
      )
    }
  }
}
