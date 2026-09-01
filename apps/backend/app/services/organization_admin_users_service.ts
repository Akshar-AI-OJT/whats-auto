import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { NotificationService } from '#services/notification_service'
import { revokeTeammateSetupAccess } from '#services/invitation_service'
import { DateTime } from 'luxon'

const ORGANIZATION_USER_SELECT = [
  'u.id',
  'u.name',
  'u.firstname',
  'u.lastname',
  'u.email',
  'u.emailVerified',
  'u.isActive',
  'u.createdAt',
  'u.updatedAt',
  'm.id as memberId',
  'r.name as role',
] as const

export type UpdateOrganizationAdminUserInput = {
  firstname?: string
  lastname?: string
  email?: string
  isActive?: boolean
}

export class OrganizationAdminUsersService {
  /**
   * Base query: live members of one org (excludes soft-deleted memberships).
   */
  protected organizationUsersQuery(organizationId: string) {
    return db
      .from('organization_members as m')
      .innerJoin('users as u', 'u.id', 'm.userId')
      .innerJoin('roles as r', 'r.id', 'm.roleId')
      .where('m.organizationId', organizationId)
      .where('m.isDeleted', false)
  }

  /**
   * Paginated users for a single organization (Organization Admin).
   * Scoped via organization_members; excludes soft-deleted memberships.
   */
  async listUsersPaginated(params: { organizationId: string; page: number; perPage: number }) {
    const { organizationId, page, perPage } = params

    return this.organizationUsersQuery(organizationId)
      .select(...ORGANIZATION_USER_SELECT)
      .orderBy('u.createdAt', 'desc')
      .paginate(page, perPage)
  }

  /**
   * Fetch one user in the organization (Organization Admin).
   * Returns null when missing, soft-deleted membership, or not a member of this org.
   */
  async getUserById(params: { organizationId: string; userId: string }) {
    const { organizationId, userId } = params

    const row = await this.organizationUsersQuery(organizationId)
      .where('u.id', userId)
      .select(...ORGANIZATION_USER_SELECT)
      .first()

    return row ?? null
  }

  /**
   * Partial update of a user in the organization (Organization Admin).
   * Scoped via getUserById — other-org and soft-deleted memberships are not found.
   * organization_id cannot be changed (membership is not updated here).
   */
  async updateUser(params: {
    organizationId: string
    userId: string
    actorUserId: string
    patch: UpdateOrganizationAdminUserInput
  }) {
    const { organizationId, userId, actorUserId, patch } = params

    const existing = await this.getUserById({ organizationId, userId })
    if (!existing) {
      return null
    }

    const updates: Record<string, string | boolean> = {}

    if (patch.firstname !== undefined) updates.firstname = patch.firstname
    if (patch.lastname !== undefined) updates.lastname = patch.lastname
    if (patch.isActive !== undefined) updates.isActive = patch.isActive

    if (patch.email !== undefined) {
      const normalizedEmail = patch.email.toLowerCase()
      if (normalizedEmail !== (existing.email as string).toLowerCase()) {
        const emailTaken = await db
          .from('users')
          .where('email', normalizedEmail)
          .whereNot('id', userId)
          .select('id')
          .first()

        if (emailTaken) {
          throw new Error('An account with this email already exists.')
        }
        updates.email = normalizedEmail
      }
    }

    if (patch.firstname !== undefined || patch.lastname !== undefined) {
      const firstname = (updates.firstname as string | undefined) ?? (existing.firstname as string)
      const lastname = (updates.lastname as string | undefined) ?? (existing.lastname as string)
      updates.name = `${firstname} ${lastname}`.trim()
    }

    if (Object.keys(updates).length === 0) {
      return existing
    }

    updates.updatedBy = actorUserId

    const previousIsActive = Boolean(existing.isActive)
    const nextIsActive =
      updates.isActive !== undefined ? Boolean(updates.isActive) : previousIsActive

    await db.transaction(async (trx) => {
      await trx.from('users').where('id', userId).update(updates)

      await trx.table('authorization_audits').insert({
        organizationId,
        actorUserId,
        targetType: 'user',
        targetId: userId,
        eventType: 'user.updated',
        before: JSON.stringify({
          firstname: existing.firstname,
          lastname: existing.lastname,
          email: existing.email,
          isActive: existing.isActive,
        }),
        after: JSON.stringify(updates),
      })
    })

    if (previousIsActive === true && nextIsActive === false) {
      const organizationName = await this.#loadOrganizationName(organizationId)
      await this.#notifyUserBestEffort({
        organizationId,
        userId,
        actorUserId,
        type: 'team_user_deactivated',
        title: 'Your account was deactivated',
        body: organizationName
          ? `Your account was deactivated in ${organizationName}.`
          : 'Your account was deactivated.',
      })
    }

    const updated = await this.getUserById({ organizationId, userId })
    if (!updated) {
      throw new Error('Failed to load updated organization user')
    }
    return updated
  }

  /**
   * Soft-delete a membership in the organization (Organization Admin).
   * Soft-deletes organization_members (isDeleted + deletedAt); does not touch users.
   * Already soft-deleted / other-org → null.
   */
  async softDeleteUser(params: { organizationId: string; userId: string; actorUserId: string }) {
    const { organizationId, userId, actorUserId } = params

    const existing = await this.getUserById({ organizationId, userId })
    if (!existing) {
      return null
    }

    if ((existing.role as string) === 'owner') {
      throw new Error('Cannot remove the Owner. Transfer ownership first.')
    }

    const memberId = existing.memberId as string
    const deletedAt = DateTime.utc().toSQL()

    await db.transaction(async (trx) => {
      await trx.from('organization_members').where('id', memberId).update({
        isDeleted: true,
        deletedAt,
      })

      await revokeTeammateSetupAccess(trx, {
        organizationId,
        userId,
      })

      await trx.table('authorization_audits').insert({
        organizationId,
        actorUserId,
        targetType: 'member',
        targetId: memberId,
        eventType: 'member.removed',
        before: JSON.stringify({
          memberId,
          userId,
          role: existing.role,
        }),
        after: JSON.stringify({
          isDeleted: true,
          deletedAt,
        }),
      })
    })

    return { ok: true as const }
  }

  async #loadOrganizationName(organizationId: string): Promise<string | null> {
    const org = await db.from('organizations').where('id', organizationId).select('name').first()
    return (org?.name as string | undefined) ?? null
  }

  /**
   * Best-effort in-app notification for an organization user. Never throws.
   */
  async #notifyUserBestEffort(params: {
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
