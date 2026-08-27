import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { Exception } from '@adonisjs/core/exceptions'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import { OrganizationStatus } from '#enums/organization_status'
import type { OrganizationStatusValue } from '#enums/organization_status'
import InvitationException from '#exceptions/invitation_exception'
import OrganizationException from '#exceptions/organization_exception'
import { getGlobalRoleIdByName, resolveAssignableRoleForOrg } from '#services/role_service'
import { bumpAllOrgMembersPermissionVersion } from '#lib/permission_version_bumps'
import { isPostgresUniqueViolation } from '#lib/pg_unique_violation'
import { NotificationService } from '#services/notification_service'
import {
  normalizeOrganizationAddress,
  parseOrganizationAddress,
  type OrganizationAddress,
} from '#lib/organization_address'

export const ORGANIZATION_TYPES = [
  'company',
  'partnership',
  'sole_proprietorship',
  'other',
] as const

export type OrganizationType = (typeof ORGANIZATION_TYPES)[number]

export type { OrganizationAddress }

export type CreateOrganizationInput = {
  name: string
  slug: string
  email: string
  phone: string
  website?: string
  industry?: string
  organizationType: OrganizationType
  address: string | OrganizationAddress
  pan?: string
  gstin?: string
  country: string
  timezone: string
  currency?: string
  description?: string
  businessSize?: string
  alternatePhone?: string
  defaultLanguage?: string
  businessRegistrationNumber?: string
  /** Optional title stored on the creating owner's membership. */
  designation?: string
}

export type UpdateOrganizationInput = {
  name?: string
  phone?: string
  website?: string
  industry?: string
  organizationType?: OrganizationType
  address?: string | OrganizationAddress
  pan?: string
  gstin?: string
  country?: string
  timezone?: string
  currency?: string
  description?: string | null
  businessSize?: string | null
  alternatePhone?: string | null
  defaultLanguage?: string | null
  businessRegistrationNumber?: string | null
  /** Optional title for the caller's membership row. */
  designation?: string | null
}

export type OrganizationPublicFields = {
  id: string
  name: string
  slug: string
  email: string
  phone: string | null
  website: string | null
  industry: string | null
  organizationType: OrganizationType | null
  address: OrganizationAddress | null
  pan: string | null
  gstin: string | null
  country: string
  timezone: string
  currency: string | null
  description: string | null
  businessSize: string | null
  alternatePhone: string | null
  defaultLanguage: string | null
  businessRegistrationNumber: string | null
}

const ORGANIZATION_PUBLIC_COLUMNS = [
  'id',
  'name',
  'slug',
  'email',
  'phone',
  'website',
  'industry',
  'organizationType',
  'address',
  'pan',
  'gstin',
  'country',
  'timezone',
  'currency',
  'description',
  'businessSize',
  'alternatePhone',
  'defaultLanguage',
  'businessRegistrationNumber',
] as const

function asOrganizationType(value: unknown): OrganizationType | null {
  if (
    value === 'company' ||
    value === 'partnership' ||
    value === 'sole_proprietorship' ||
    value === 'other'
  ) {
    return value
  }
  return null
}

function mapOrganizationPublicFields(row: Record<string, unknown>): OrganizationPublicFields {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    email: row.email as string,
    phone: (row.phone as string | null) ?? null,
    website: (row.website as string | null) ?? null,
    industry: (row.industry as string | null) ?? null,
    organizationType: asOrganizationType(row.organizationType),
    address: parseOrganizationAddress(row.address),
    pan: (row.pan as string | null) ?? null,
    gstin: (row.gstin as string | null) ?? null,
    country: row.country as string,
    timezone: row.timezone as string,
    currency: (row.currency as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    businessSize: (row.businessSize as string | null) ?? null,
    alternatePhone: (row.alternatePhone as string | null) ?? null,
    defaultLanguage: (row.defaultLanguage as string | null) ?? null,
    businessRegistrationNumber: (row.businessRegistrationNumber as string | null) ?? null,
  }
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
   * otherwise invitees end up creating a second organization instead of joining the inviter's.
   * Users who already belong to an organization stay free to create more.
   */
  protected async assertNoBlockingInvitation(userId: string) {
    // Membership rows survive soft-delete, so a deleted org must not count as
    // "already belongs somewhere" and skip the pending-invitation check.
    const membership = await db
      .from('organization_members as m')
      .innerJoin('organizations as o', 'o.id', 'm.organizationId')
      .where('m.userId', userId)
      .whereNull('o.deletedAt')
      .select('m.id')
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
   * New orgs start as pending_setup. Session switches to the new org only when
   * the caller has no already-active organization (avoids stranding a paid owner).
   * Reuses the caller's existing pending_setup org on retry to avoid email/slug collisions.
   */
  async createOrganization(params: {
    userId: string
    sessionId: string
    data: CreateOrganizationInput
  }) {
    const { userId, sessionId, data } = params

    await this.assertNoBlockingInvitation(userId)

    const ownerRoleId = await getGlobalRoleIdByName('owner')
    const hasActiveOrganization = await this.#userHasActiveOrganization(userId)

    const existingPending = await this.#findOwnedPendingSetupOrg(userId)
    if (existingPending) {
      return this.#reusePendingSetupOrg({
        org: existingPending,
        userId,
        sessionId,
        data,
        activateSession: !hasActiveOrganization,
      })
    }

    try {
      return await db.transaction(async (trx) => {
        const address = normalizeOrganizationAddress(data.address, data.country)
        const [org] = await trx
          .table('organizations')
          .insert({
            name: data.name,
            slug: data.slug,
            email: data.email,
            phone: data.phone,
            website: data.website ?? null,
            industry: data.industry ?? null,
            organizationType: data.organizationType,
            address,
            pan: data.pan ? data.pan.replace(/\s+/g, '').toUpperCase() : null,
            gstin: data.gstin ? data.gstin.replace(/\s+/g, '').toUpperCase() : null,
            country: data.country,
            timezone: data.timezone,
            currency: data.currency ?? null,
            description: data.description ?? null,
            businessSize: data.businessSize ?? null,
            alternatePhone: data.alternatePhone ?? null,
            defaultLanguage: data.defaultLanguage ?? null,
            businessRegistrationNumber: data.businessRegistrationNumber ?? null,
            status: OrganizationStatus.PENDING_SETUP,
          })
          .returning([...ORGANIZATION_PUBLIC_COLUMNS, 'status', 'createdAt'])

        await trx.table('organization_members').insert({
          organizationId: org.id,
          userId,
          roleId: ownerRoleId,
          designation: data.designation ?? null,
        })

        await trx.table('user_roles').insert({
          userId,
          roleId: ownerRoleId,
          organizationId: org.id,
        })

        const sessionActivated = !hasActiveOrganization
        if (sessionActivated) {
          await trx.from('sessions').where('id', sessionId).update({
            activeOrganizationId: org.id,
          })
        }

        await trx.table('authorization_audits').insert({
          organizationId: org.id,
          actorUserId: userId,
          targetType: 'organization',
          targetId: org.id,
          eventType: 'organization.created',
          after: JSON.stringify({
            name: org.name,
            slug: org.slug,
            status: OrganizationStatus.PENDING_SETUP,
          }),
        })

        return {
          ...mapOrganizationPublicFields(org as Record<string, unknown>),
          status: org.status as OrganizationStatusValue,
          createdAt: org.createdAt as string,
          role: 'owner',
          sessionActivated,
        }
      })
    } catch (error) {
      if (isPostgresUniqueViolation(error, 'organizations_slug_unique')) {
        throw OrganizationException.slugAlreadyExists(data.slug)
      }
      // Email collision with the caller's own pending org (race) — reuse it.
      if (isPostgresUniqueViolation(error, 'organizations_email_unique')) {
        const pending = await this.#findOwnedPendingSetupOrg(userId)
        if (pending) {
          return this.#reusePendingSetupOrg({
            org: pending,
            userId,
            sessionId,
            data,
            activateSession: !hasActiveOrganization,
          })
        }
      }
      throw error
    }
  }

  /**
   * Promote an organization to active after a successful entitlement path
   * (paid order, super-admin grant, legacy webhook). Idempotent.
   */
  async promoteToActive(organizationId: string, trx?: TransactionClientContract): Promise<void> {
    const query = (trx ?? db)
      .from('organizations')
      .where('id', organizationId)
      .whereNull('deletedAt')
      .whereNot('status', OrganizationStatus.ACTIVE)
      .update({ status: OrganizationStatus.ACTIVE })

    await query
  }

  async #userHasActiveOrganization(userId: string): Promise<boolean> {
    const row = await db
      .from('organization_members as m')
      .innerJoin('organizations as o', 'o.id', 'm.organizationId')
      .where('m.userId', userId)
      .where('m.isDeleted', false)
      .whereNull('o.deletedAt')
      .where('o.status', OrganizationStatus.ACTIVE)
      .select('o.id')
      .first()
    return Boolean(row)
  }

  async #findOwnedPendingSetupOrg(userId: string) {
    return db
      .from('organization_members as m')
      .innerJoin('organizations as o', 'o.id', 'm.organizationId')
      .innerJoin('roles as r', 'r.id', 'm.roleId')
      .where('m.userId', userId)
      .where('m.isDeleted', false)
      .whereNull('o.deletedAt')
      .where('o.status', OrganizationStatus.PENDING_SETUP)
      .where('r.name', 'owner')
      .select(
        'o.id',
        'o.name',
        'o.slug',
        'o.email',
        'o.phone',
        'o.website',
        'o.industry',
        'o.organizationType',
        'o.address',
        'o.pan',
        'o.gstin',
        'o.country',
        'o.timezone',
        'o.currency',
        'o.description',
        'o.businessSize',
        'o.alternatePhone',
        'o.defaultLanguage',
        'o.businessRegistrationNumber',
        'o.status',
        'o.createdAt'
      )
      .orderBy('o.createdAt', 'asc')
      .first()
  }

  async #reusePendingSetupOrg(params: {
    org: Record<string, unknown>
    userId: string
    sessionId: string
    data: CreateOrganizationInput
    activateSession: boolean
  }) {
    const { org, userId, sessionId, data, activateSession } = params
    const organizationId = org.id as string
    const address = normalizeOrganizationAddress(data.address, data.country)

    return db.transaction(async (trx) => {
      const [updated] = await trx
        .from('organizations')
        .where('id', organizationId)
        .update({
          name: data.name,
          // Keep existing slug/email to avoid unique collisions on retry with new values.
          phone: data.phone,
          website: data.website ?? null,
          industry: data.industry ?? null,
          organizationType: data.organizationType,
          address,
          pan: data.pan ? data.pan.replace(/\s+/g, '').toUpperCase() : null,
          gstin: data.gstin ? data.gstin.replace(/\s+/g, '').toUpperCase() : null,
          country: data.country,
          timezone: data.timezone,
          currency: data.currency ?? null,
          description: data.description ?? null,
          businessSize: data.businessSize ?? null,
          alternatePhone: data.alternatePhone ?? null,
          defaultLanguage: data.defaultLanguage ?? null,
          businessRegistrationNumber: data.businessRegistrationNumber ?? null,
        })
        .returning([...ORGANIZATION_PUBLIC_COLUMNS, 'status', 'createdAt'])

      if (data.designation !== undefined) {
        await trx
          .from('organization_members')
          .where('organizationId', organizationId)
          .where('userId', userId)
          .where('isDeleted', false)
          .update({ designation: data.designation ?? null })
      }
      if (activateSession) {
        await trx.from('sessions').where('id', sessionId).update({
          activeOrganizationId: organizationId,
        })
      }

      await trx.table('authorization_audits').insert({
        organizationId,
        actorUserId: userId,
        targetType: 'organization',
        targetId: organizationId,
        eventType: 'organization.pending_setup_reused',
        after: JSON.stringify({ name: data.name }),
      })

      return {
        ...mapOrganizationPublicFields(updated as Record<string, unknown>),
        status: updated.status as OrganizationStatusValue,
        createdAt: updated.createdAt as string,
        role: 'owner',
        sessionActivated: activateSession,
        reused: true as const,
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
      .select(
        'o.id',
        'o.name',
        'o.slug',
        'o.email',
        'o.phone',
        'o.website',
        'o.industry',
        'o.organizationType',
        'o.address',
        'o.pan',
        'o.gstin',
        'o.country',
        'o.timezone',
        'o.currency',
        'o.description',
        'o.businessSize',
        'o.alternatePhone',
        'o.defaultLanguage',
        'o.businessRegistrationNumber',
        'o.status',
        'r.name as role',
        'o.createdAt'
      )
      .orderBy('o.name', 'asc')

    return rows.map((r) => ({
      ...mapOrganizationPublicFields(r as Record<string, unknown>),
      status: r.status as OrganizationStatusValue,
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

    // Use query builder (not Lucid model): DB columns are camelCase (`createdAt`),
    // while Lucid's default naming strategy rewrites orderBy('createdAt') → created_at.
    return db.from('organizations').orderBy('createdAt', 'desc').paginate(page, perPage)
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

    const updates: Record<string, string | null | OrganizationAddress> = {}
    if (patch.name !== undefined) updates.name = patch.name
    if (patch.phone !== undefined) updates.phone = patch.phone
    if (patch.website !== undefined) updates.website = patch.website
    if (patch.industry !== undefined) updates.industry = patch.industry
    if (patch.organizationType !== undefined) updates.organizationType = patch.organizationType
    if (patch.address !== undefined) {
      updates.address = normalizeOrganizationAddress(patch.address)
    }
    if (patch.pan !== undefined) updates.pan = patch.pan.replace(/\s+/g, '').toUpperCase()
    if (patch.gstin !== undefined) updates.gstin = patch.gstin.replace(/\s+/g, '').toUpperCase()
    if (patch.country !== undefined) updates.country = patch.country
    if (patch.timezone !== undefined) updates.timezone = patch.timezone
    if (patch.currency !== undefined) updates.currency = patch.currency
    if (patch.description !== undefined) updates.description = patch.description
    if (patch.businessSize !== undefined) updates.businessSize = patch.businessSize
    if (patch.alternatePhone !== undefined) updates.alternatePhone = patch.alternatePhone
    if (patch.defaultLanguage !== undefined) updates.defaultLanguage = patch.defaultLanguage
    if (patch.businessRegistrationNumber !== undefined) {
      updates.businessRegistrationNumber = patch.businessRegistrationNumber
    }

    const hasOrgUpdates = Object.keys(updates).length > 0
    const hasDesignationUpdate = patch.designation !== undefined

    if (!hasOrgUpdates && !hasDesignationUpdate) {
      return mapOrganizationPublicFields(existing as Record<string, unknown>)
    }

    return db.transaction(async (trx) => {
      let updated = existing as Record<string, unknown>

      if (hasOrgUpdates) {
        const [row] = await trx
          .from('organizations')
          .where('id', organizationId)
          .update(updates)
          .returning([...ORGANIZATION_PUBLIC_COLUMNS])
        updated = row as Record<string, unknown>
      }

      if (hasDesignationUpdate) {
        await trx
          .from('organization_members')
          .where('organizationId', organizationId)
          .where('userId', actorUserId)
          .where('isDeleted', false)
          .update({ designation: patch.designation ?? null })
      }

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
          organizationType: existing.organizationType,
          address: existing.address,
          pan: existing.pan,
          gstin: existing.gstin,
          country: existing.country,
          timezone: existing.timezone,
          currency: existing.currency,
          description: existing.description,
          businessSize: existing.businessSize,
          alternatePhone: existing.alternatePhone,
          defaultLanguage: existing.defaultLanguage,
          businessRegistrationNumber: existing.businessRegistrationNumber,
        }),
        after: JSON.stringify({
          ...updates,
          ...(hasDesignationUpdate ? { designation: patch.designation ?? null } : {}),
        }),
      })

      return mapOrganizationPublicFields(updated)
    })
  }

  /**
   * Soft-delete an organization.
   *
   * Nothing owned by the org is erased: `organizations.deletedAt` is the only
   * lifecycle marker, and every organizationId foreign key already cascades,
   * so a later hard delete of this row is all it takes to clean up. Access is
   * cut off by bumping member permission versions (existing Bearer tokens go
   * stale) and clearing the active org from sessions (no re-mint), not by RLS.
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

    const deletedAt = DateTime.utc()

    await db.transaction(async (trx) => {
      await trx.table('authorization_audits').insert({
        organizationId,
        actorUserId,
        targetType: 'organization',
        targetId: organizationId,
        eventType: 'organization.soft_deleted',
        before: JSON.stringify({ name: org.name, slug: org.slug, status: org.status }),
        after: JSON.stringify({ status: OrganizationStatus.FALSE, deletedAt: deletedAt.toISO() }),
      })

      await trx.from('organizations').where('id', organizationId).update({
        status: OrganizationStatus.FALSE,
        deletedAt: deletedAt.toSQL(),
      })

      // Member rows survive soft-delete — bump every version so Bearer tokens go stale.
      await bumpAllOrgMembersPermissionVersion(trx, organizationId)

      // Existing org should not stay active on any session once soft-deleted.
      await trx
        .from('sessions')
        .where('activeOrganizationId', organizationId)
        .update({ activeOrganizationId: null })
    })

    // After soft-delete commits — best-effort fan-out must not roll back deletion.
    await this.#notifyMembersOrganizationSoftDeleted({
      organizationId,
      actorUserId,
    })
  }

  /**
   * Best-effort in-app notifications for all active org members after soft-delete.
   */
  async #notifyMembersOrganizationSoftDeleted(params: {
    organizationId: string
    actorUserId: string
  }): Promise<void> {
    try {
      const members = await db
        .from('organization_members')
        .where('organizationId', params.organizationId)
        .where('isDeleted', false)
        .select('userId')

      const notifications = new NotificationService()
      for (const member of members) {
        const userId = member.userId as string
        try {
          await notifications.createNotification({
            organizationId: params.organizationId,
            userId,
            type: 'organization_soft_deleted',
            title: 'Organization unavailable',
            body: 'This organization has been deleted and is no longer available.',
            actorUserId: params.actorUserId,
          })
        } catch (error) {
          logger.error(
            {
              organizationId: params.organizationId,
              userId,
              type: 'organization_soft_deleted',
              err: error instanceof Error ? error.message : 'unknown',
            },
            'organization.notification_failed'
          )
        }
      }
    } catch (error) {
      logger.error(
        {
          organizationId: params.organizationId,
          type: 'organization_soft_deleted',
          err: error instanceof Error ? error.message : 'unknown',
        },
        'organization.notification_failed'
      )
    }
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

    const newOwnerUserId = await db.transaction(async (trx) => {
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
      await trx.rawQuery(
        `UPDATE "organization_members"
         SET "roleId" = ?, "permissionVersion" = "permissionVersion" + 1
         WHERE "id" = ?`,
        [replacement.id, currentOwnerMemberId]
      )

      await trx
        .from('user_roles')
        .where('userId', currentUserId)
        .where('organizationId', organizationId)
        .update({ roleId: replacement.id })

      // 2. Promote target to owner
      await trx.rawQuery(
        `UPDATE "organization_members"
         SET "roleId" = ?, "permissionVersion" = "permissionVersion" + 1
         WHERE "id" = ?`,
        [ownerRoleId, targetMemberId]
      )

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

      return targetUserId
    })

    // After ownership transfer commits — best-effort notify must not roll back transfer.
    const org = await db.from('organizations').where('id', organizationId).select('name').first()
    const organizationName = (org?.name as string | undefined) ?? null
    await this.#notifyOwnershipTransferredBestEffort({
      organizationId,
      userId: newOwnerUserId,
      actorUserId,
      organizationName,
    })
  }

  /**
   * Best-effort in-app notification for the new owner after ownership transfer. Never throws.
   */
  async #notifyOwnershipTransferredBestEffort(params: {
    organizationId: string
    userId: string
    actorUserId: string
    organizationName: string | null
  }): Promise<void> {
    try {
      await new NotificationService().createNotification({
        organizationId: params.organizationId,
        userId: params.userId,
        type: 'team_ownership_transferred',
        title: 'You are now the organization owner',
        body: params.organizationName
          ? `Ownership of ${params.organizationName} has been transferred to you.`
          : 'Ownership of this organization has been transferred to you.',
        actorUserId: params.actorUserId,
      })
    } catch (error) {
      logger.error(
        {
          organizationId: params.organizationId,
          userId: params.userId,
          type: 'team_ownership_transferred',
          err: error instanceof Error ? error.message : 'unknown',
        },
        'team.notification_failed'
      )
    }
  }
}
