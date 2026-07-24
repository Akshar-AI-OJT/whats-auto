import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { SEEDED_ROLES } from '#abilities/role_seeds'
import { toStoredPermissionJson } from '#abilities/permissions'
import RoleException from '#exceptions/role_exception'
import { assertAssignableRoleKey } from '#services/role_service'

export class OrganizationService {
  /**
   * Called after Better Auth creates an organization.
   * Seeds the 3 default dynamic roles (admin, agent, viewer).
   * Owner is static in Better Auth — never seeded here.
   */
  async seedDefaultRoles(
    organizationId: string,
    trx?: TransactionClientContract
  ): Promise<void> {
    const rows = SEEDED_ROLES.map((seed) => ({
      organizationId,
      role: seed.role,
      displayName: seed.displayName,
      permission: JSON.stringify(toStoredPermissionJson(seed.permissions)),
    }))

    const client = trx ?? db
    await client.table('organization_roles').insert(rows)
  }

  /**
   * Transfer ownership atomically. Exactly one owner must exist before and after.
   * The deferred constraint trigger asserts the invariant at COMMIT, so promote
   * + demote in one statement/transaction is safe.
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

    assertAssignableRoleKey(replacementRoleForCurrentOwner)

    const replacementExists = await db
      .from('organization_roles')
      .where('organizationId', organizationId)
      .where('role', replacementRoleForCurrentOwner)
      .select('role')
      .first()

    if (!replacementExists) {
      throw RoleException.replacementMissing(replacementRoleForCurrentOwner)
    }

    await db.transaction(async (trx) => {
      // Lock both rows to prevent concurrent transfer
      const [current, target] = await Promise.all([
        trx.rawQuery(
          `SELECT * FROM "organization_members" WHERE "id" = ? AND "organizationId" = ? FOR UPDATE`,
          [currentOwnerMemberId, organizationId]
        ),
        trx.rawQuery(
          `SELECT * FROM "organization_members" WHERE "id" = ? AND "organizationId" = ? FOR UPDATE`,
          [targetMemberId, organizationId]
        ),
      ])

      if (!current.rows[0] || current.rows[0].role !== 'owner') {
        throw new Error('Current owner not found or is no longer owner')
      }
      if (!target.rows[0]) {
        throw new Error('Target member not found in this organization')
      }

      // Single statement swap — deferred trigger validates exactly one owner at COMMIT
      await trx.rawQuery(
        `
        UPDATE "organization_members"
        SET "role" = CASE
          WHEN "id" = ? THEN 'owner'
          WHEN "id" = ? THEN ?
        END
        WHERE "organizationId" = ?
          AND "id" IN (?, ?)
        `,
        [
          targetMemberId,
          currentOwnerMemberId,
          replacementRoleForCurrentOwner,
          organizationId,
          targetMemberId,
          currentOwnerMemberId,
        ]
      )

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
