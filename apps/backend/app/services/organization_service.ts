import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { Exception } from '@adonisjs/core/exceptions'
import { DateTime } from 'luxon'
import Organization from '#models/organization'
import InvitationException from '#exceptions/invitation_exception'
import { getGlobalRoleIdByName, resolveAssignableRoleForOrg } from '#services/role_service'

export type CreateOrganizationInput = {
  name: string
  slug: string
  email: string
  phone?: string
  website?: string
  industry?: string
  country: string
  timezone: string
  currency?: string
}

export type UpdateOrganizationInput = {
  name?: string
  phone?: string
  website?: string
  industry?: string
  timezone?: string
  currency?: string
}

export class OrganizationService {
  

  /**
   * Per-org role seed hook. Global admin/agent/viewer permissions are seeded via rbac_seeder.
   */
  async seedDefaultRoles(_organizationId: string, _trx?: TransactionClientContract): Promise<void> {
    return
  }

  /**
   * A user who belongs to no organization yet must resolve a pending invitation first,
   * otherwise invitees end up creating a second workspace instead of joining the inviter's.
   * Users who already belong to an organization stay free to create more.
   */
  protected async assertNoBlockingInvitation(userId: string) {
    const membership = await db
      .from('organization_members')
      .where('userId', userId)
      .select('id')
      .first()

    if (membership) return

    const user = await db.from('users').where('id', userId).select('email').firstOrFail()

    const pending = await db
      .from('organization_invitations as i')
      .innerJoin('organizations as o', 'o.id', 'i.organizationId')
      .whereRaw('LOWER(i.email) = ?', [(user.email as string).toLowerCase()])
      .where('i.status', 'pending')
      .where('i.expiresAt', '>', new Date())
      .whereNull('o.deletedAt')
      .select('i.id')
      .first()

    if (pending) {
      throw InvitationException.pendingInvitationBlocksOrgCreation()
    }
  }

  /**
   * Create an organization and make the caller the owner.
   * Dual-writes organization_members + user_roles, sets active org on the session.
   */
  async createOrganization(params: {
    userId: string
    sessionId: string
    data: CreateOrganizationInput
  }) {
    const { userId, sessionId, data } = params

    await this.assertNoBlockingInvitation(userId)

    const ownerRoleId = await getGlobalRoleIdByName('owner')

    return db.transaction(async (trx) => {
      const [org] = await trx
        .table('organizations')
        .insert({
          name: data.name,
          slug: data.slug,
          email: data.email,
          phone: data.phone ?? null,
          website: data.website ?? null,
          industry: data.industry ?? null,
          country: data.country,
          timezone: data.timezone,
          currency: data.currency ?? null,
        })
        .returning([
          'id',
          'name',
          'slug',
          'email',
          'phone',
          'website',
          'industry',
          'country',
          'timezone',
          'currency',
          'status',
          'createdAt',
        ])

      await trx.table('organization_members').insert({
        organizationId: org.id,
        userId,
        roleId: ownerRoleId,
      })

      await trx.table('user_roles').insert({
        userId,
        roleId: ownerRoleId,
        organizationId: org.id,
      })

      await trx.from('sessions').where('id', sessionId).update({
        activeOrganizationId: org.id,
      })

      await trx.table('authorization_audits').insert({
        organizationId: org.id,
        actorUserId: userId,
        targetType: 'organization',
        targetId: org.id,
        eventType: 'organization.created',
        after: JSON.stringify({ name: org.name, slug: org.slug }),
      })

      return {
        id: org.id as string,
        name: org.name as string,
        slug: org.slug as string,
        email: org.email as string,
        phone: org.phone as string | null,
        website: org.website as string | null,
        industry: org.industry as string | null,
        country: org.country as string,
        timezone: org.timezone as string,
        currency: org.currency as string | null,
        status: org.status as boolean,
        createdAt: org.createdAt as string,
        role: 'owner',
      }
    })
  }

  /**
   * List organizations the user belongs to (excludes soft-deleted).
   */
  async listMyOrganizations(userId: string) {
    const rows = await db
      .from('organization_members as m')
      .innerJoin('organizations as o', 'o.id', 'm.organizationId')
      .innerJoin('roles as r', 'r.id', 'm.roleId')
      .where('m.userId', userId)
      .whereNull('o.deletedAt')
      .select('o.id', 'o.name', 'o.slug', 'o.email', 'r.name as role', 'o.createdAt')
      .orderBy('o.name', 'asc')

    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      email: r.email as string,
      role: r.role as string,
      createdAt: r.createdAt as string,
    }))
  }

 

  /**
   * Platform-wide paginated organization list for Super Admin.
   * Includes soft-deleted organizations so admins can audit full tenant history.
   */
  async listOrganizationsPaginated(params: { page: number; perPage: number }) {
    const { page, perPage } = params

    return Organization.query().orderBy('createdAt', 'desc').paginate(page, perPage)
  }

  /**
   * Set the active organization on the caller's session.
   */
  async setActiveOrganization(params: {
    userId: string
    sessionId: string
    organizationId: string
  }) {
    const { userId, sessionId, organizationId } = params

    const membership = await db
      .from('organization_members as m')
      .innerJoin('organizations as o', 'o.id', 'm.organizationId')
      .where('m.userId', userId)
      .where('m.organizationId', organizationId)
      .whereNull('o.deletedAt')
      .select('m.id')
      .first()

    if (!membership) {
      throw new Error('You are not a member of this organization')
    }

    await db.from('sessions').where('id', sessionId).update({
      activeOrganizationId: organizationId,
    })

    return { organizationId }
  }

  /**
   * Update editable organization fields (not slug/email).
   * Only provided fields are updated (partial update).
   */
  async updateOrganization(params: {
    organizationId: string
    actorUserId: string
    patch: UpdateOrganizationInput
  }) {
    const { organizationId, actorUserId, patch } = params

    const existing = await db
      .from('organizations')
      .where('id', organizationId)
      .whereNull('deletedAt')
      .first()

    if (!existing) {
      throw new Exception('Organization Not Found', {
        status: 404,
        code: 'E_ORGANIZATION_NOT_FOUND',
      })
    }

    const updates: Record<string, string | null> = {}
    if (patch.name !== undefined) updates.name = patch.name
    if (patch.phone !== undefined) updates.phone = patch.phone
    if (patch.website !== undefined) updates.website = patch.website
    if (patch.industry !== undefined) updates.industry = patch.industry
    if (patch.timezone !== undefined) updates.timezone = patch.timezone
    if (patch.currency !== undefined) updates.currency = patch.currency

    if (Object.keys(updates).length === 0) {
      return {
        id: existing.id as string,
        name: existing.name as string,
        slug: existing.slug as string,
        email: existing.email as string,
        phone: existing.phone as string | null,
        website: existing.website as string | null,
        industry: existing.industry as string | null,
        country: existing.country as string,
        timezone: existing.timezone as string,
        currency: existing.currency as string | null,
      }
    }

    return db.transaction(async (trx) => {
      const [updated] = await trx
        .from('organizations')
        .where('id', organizationId)
        .update(updates)
        .returning([
          'id',
          'name',
          'slug',
          'email',
          'phone',
          'website',
          'industry',
          'country',
          'timezone',
          'currency',
        ])

      await trx.table('authorization_audits').insert({
        organizationId,
        actorUserId,
        targetType: 'organization',
        targetId: organizationId,
        eventType: 'organization.updated',
        before: JSON.stringify({
          name: existing.name,
          phone: existing.phone,
          website: existing.website,
          industry: existing.industry,
          timezone: existing.timezone,
          currency: existing.currency,
        }),
        after: JSON.stringify(updates),
      })

      return {
        id: updated.id as string,
        name: updated.name as string,
        slug: updated.slug as string,
        email: updated.email as string,
        phone: updated.phone as string | null,
        website: updated.website as string | null,
        industry: updated.industry as string | null,
        country: updated.country as string,
        timezone: updated.timezone as string,
        currency: updated.currency as string | null,
      }
    })
  }

  /**
   * Soft-delete an organization and explicitly cascade related rows.
   * Audit history is retained.
   */
  async deleteOrganization(params: { organizationId: string; actorUserId: string }) {
    const { organizationId, actorUserId } = params

    const org = await db
      .from('organizations')
      .where('id', organizationId)
      .whereNull('deletedAt')
      .first()

    if (!org) {
      throw new Exception('Organization Not Found', {
        status: 404,
        code: 'E_ORGANIZATION_NOT_FOUND',
      })
    }

    await db.transaction(async (trx) => {
      await trx.table('authorization_audits').insert({
        organizationId,
        actorUserId,
        targetType: 'organization',
        targetId: organizationId,
        eventType: 'organization.deleted',
        before: JSON.stringify({ name: org.name, slug: org.slug }),
      })

      await trx.from('organization_members').where('organizationId', organizationId).delete()
      await trx.from('organization_invitations').where('organizationId', organizationId).delete()
      await trx
        .from('organization_role_permissions')
        .where('organizationId', organizationId)
        .delete()
      await trx.from('user_roles').where('organizationId', organizationId).delete()

      await trx.from('organizations').where('id', organizationId).update({
        deletedAt: DateTime.utc().toSQL(),
      })

      // Clear active org on any sessions still pointing at this org
      await trx
        .from('sessions')
        .where('activeOrganizationId', organizationId)
        .update({ activeOrganizationId: null })
    })
  }

  /**
   * Soft-delete an organization without removing the row.
   * Uses the existing soft-delete convention: set deletedAt and disable status.
   */
  async softDeleteOrganization(params: { organizationId: string; actorUserId: string }) {
    const { organizationId, actorUserId } = params

    const org = await db
      .from('organizations')
      .where('id', organizationId)
      .whereNull('deletedAt')
      .first()

    if (!org) {
      throw new Exception('Organization Not Found', {
        status: 404,
        code: 'E_ORGANIZATION_NOT_FOUND',
      })
    }

    await db.transaction(async (trx) => {
      await trx.table('authorization_audits').insert({
        organizationId,
        actorUserId,
        targetType: 'organization',
        targetId: organizationId,
        eventType: 'organization.soft_deleted',
        before: JSON.stringify({ status: org.status, deletedAt: org.deletedAt }),
        after: JSON.stringify({ status: false, deletedAt: DateTime.utc().toISO() }),
      })

      await trx.from('organizations').where('id', organizationId).update({
        status: false,
        deletedAt: DateTime.utc().toSQL(),
      })

      // Existing org should not stay active on any session once soft-deleted.
      await trx
        .from('sessions')
        .where('activeOrganizationId', organizationId)
        .update({ activeOrganizationId: null })
    })
  }

  /**
   * Transfer ownership atomically via sequential demote-then-promote.
   * Dual-writes organization_members + user_roles. The immediate
   * trg_ensure_one_owner_per_org trigger requires demote before promote.
   */
  async transferOwnership(params: {
    organizationId: string
    currentOwnerMemberId: string
    targetMemberId: string
    replacementRoleForCurrentOwner: string
    actorUserId: string
    reason: string
  }): Promise<void> {
    const {
      organizationId,
      currentOwnerMemberId,
      targetMemberId,
      replacementRoleForCurrentOwner,
      actorUserId,
      reason,
    } = params

    if (currentOwnerMemberId === targetMemberId) {
      throw new Error('Cannot transfer ownership to the same member')
    }

    const replacement = await resolveAssignableRoleForOrg(
      organizationId,
      replacementRoleForCurrentOwner
    )
    const ownerRoleId = await getGlobalRoleIdByName('owner')

    await db.transaction(async (trx) => {
      const [current, target] = await Promise.all([
        trx.rawQuery(
          `SELECT m.*, r."name" as "roleName"
           FROM "organization_members" m
           JOIN "roles" r ON r."id" = m."roleId"
           WHERE m."id" = ? AND m."organizationId" = ?
           FOR UPDATE OF m`,
          [currentOwnerMemberId, organizationId]
        ),
        trx.rawQuery(
          `SELECT m.*, r."name" as "roleName"
           FROM "organization_members" m
           JOIN "roles" r ON r."id" = m."roleId"
           WHERE m."id" = ? AND m."organizationId" = ?
           FOR UPDATE OF m`,
          [targetMemberId, organizationId]
        ),
      ])

      if (!current.rows[0] || current.rows[0].roleName !== 'owner') {
        throw new Error('Current owner not found or is no longer owner')
      }
      if (!target.rows[0]) {
        throw new Error('Target member not found in this organization')
      }

      const currentUserId = current.rows[0].userId as string
      const targetUserId = target.rows[0].userId as string

      // 1. Demote current owner first (immediate trigger requires this order)
      await trx
        .from('organization_members')
        .where('id', currentOwnerMemberId)
        .update({ roleId: replacement.id })

      await trx
        .from('user_roles')
        .where('userId', currentUserId)
        .where('organizationId', organizationId)
        .update({ roleId: replacement.id })

      // 2. Promote target to owner
      await trx
        .from('organization_members')
        .where('id', targetMemberId)
        .update({ roleId: ownerRoleId })

      await trx
        .from('user_roles')
        .where('userId', targetUserId)
        .where('organizationId', organizationId)
        .update({ roleId: ownerRoleId })

      await trx.table('authorization_audits').insert({
        organizationId,
        actorUserId,
        targetType: 'ownership',
        targetId: targetMemberId,
        eventType: 'ownership.transferred',
        before: JSON.stringify({ ownerId: currentOwnerMemberId }),
        after: JSON.stringify({
          ownerId: targetMemberId,
          previousOwnerNewRole: replacementRoleForCurrentOwner,
        }),
        reason,
      })
    })
  }
}
