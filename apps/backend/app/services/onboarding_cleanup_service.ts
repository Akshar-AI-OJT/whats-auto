import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { OrganizationStatus } from '#enums/organization_status'
import { runWithTenant } from '#services/tenant_context'

const DEFAULT_PENDING_ORG_MAX_AGE_DAYS = 30
/** Hard-delete identity rows with no usable org membership after this idle window. */
const DEFAULT_ORPHAN_USER_MAX_AGE_DAYS = 30

export type OnboardingCleanupResult = {
  expiredVerifications: number
  purgedOrganizations: number
  skippedOrganizations: number
  purgedOrphanUsers: number
}

/**
 * Daily sweep: expire abandoned pre-signup OTP rows, purge aged unpaid setup orgs
 * (`pending_setup` | `verified_setup`) that never paid, and hard-delete orphan user
 * identities with no live membership for N days ([D73]). Cascades remove accounts,
 * sessions, memberships, notifications, etc.
 */
export class OnboardingCleanupService {
  async run(params?: {
    now?: Date
    pendingOrgMaxAgeDays?: number
    orphanUserMaxAgeDays?: number
  }): Promise<OnboardingCleanupResult> {
    const now = params?.now ?? new Date()
    const maxAgeDays = params?.pendingOrgMaxAgeDays ?? DEFAULT_PENDING_ORG_MAX_AGE_DAYS
    const orphanUserMaxAgeDays = params?.orphanUserMaxAgeDays ?? DEFAULT_ORPHAN_USER_MAX_AGE_DAYS
    const cutoff = new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000)

    const expiredVerifications = await db
      .from('verifications')
      .where('expiresAt', '<', now)
      .delete()

    const candidates = await db
      .from('organizations')
      .whereIn('status', [OrganizationStatus.PENDING_SETUP, OrganizationStatus.VERIFIED_SETUP])
      .whereNull('deletedAt')
      .where('createdAt', '<', cutoff)
      .select('id', 'slug', 'status', 'createdAt')

    let purgedOrganizations = 0
    let skippedOrganizations = 0

    for (const org of candidates) {
      const organizationId = org.id as string
      const paidEvidence = await this.#hasPaidEvidence(organizationId)
      if (paidEvidence) {
        skippedOrganizations += 1
        logger.warn(
          {
            organizationId,
            slug: org.slug,
            status: org.status,
            reason: paidEvidence,
          },
          'onboarding.cleanup.skip_unpaid_org_with_paid_evidence'
        )
        continue
      }

      await runWithTenant(organizationId, async () => {
        await db.from('organizations').where('id', organizationId).delete()
      })
      purgedOrganizations += 1
      logger.info(
        {
          organizationId,
          slug: org.slug,
          status: org.status,
          createdAt: org.createdAt,
        },
        'onboarding.cleanup.purged_unpaid_org'
      )
    }

    const purgedOrphanUsers = await this.#purgeOrphanUsers(now, orphanUserMaxAgeDays)

    return {
      expiredVerifications: Number(expiredVerifications) || 0,
      purgedOrganizations,
      skippedOrganizations,
      purgedOrphanUsers,
    }
  }

  /**
   * Hard-delete users with no usable tenancy for `maxAgeDays`.
   * Live membership = organization_members.isDeleted = false AND organizations.deletedAt IS NULL.
   * Orphan clock = last membership/org end (soft-delete), else users.createdAt.
   * Never deletes platform superadmins.
   */
  async #purgeOrphanUsers(now: Date, maxAgeDays: number): Promise<number> {
    const cutoff = new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000)

    const result = await db.rawQuery(
      `
      SELECT u.id, u.email
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1
        FROM organization_members m
        INNER JOIN organizations o ON o.id = m."organizationId"
        WHERE m."userId" = u.id
          AND m."isDeleted" = false
          AND o."deletedAt" IS NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur."roleId"
        WHERE ur."userId" = u.id
          AND ur."organizationId" IS NULL
          AND r.name = 'superadmin'
      )
      AND COALESCE(
        (
          SELECT MAX(ended_at)
          FROM (
            SELECT m."deletedAt" AS ended_at
            FROM organization_members m
            WHERE m."userId" = u.id
              AND m."isDeleted" = true
              AND m."deletedAt" IS NOT NULL
            UNION ALL
            SELECT o."deletedAt"
            FROM organization_members m
            INNER JOIN organizations o ON o.id = m."organizationId"
            WHERE m."userId" = u.id
              AND o."deletedAt" IS NOT NULL
          ) ends
        ),
        u."createdAt"
      ) < ?
      `,
      [cutoff]
    )

    const candidates = ((result as { rows?: Array<{ id: string; email: string }> }).rows ??
      (Array.isArray(result) ? result : [])) as Array<{ id: string; email: string }>
    let purged = 0

    for (const user of candidates) {
      const userId = user.id
      await db.from('users').where('id', userId).delete()
      purged += 1
      logger.info({ userId, email: user.email }, 'onboarding.cleanup.purged_orphan_user')
    }

    return purged
  }

  async #hasPaidEvidence(organizationId: string): Promise<string | null> {
    const invoice = await db
      .from('invoices')
      .where('organizationId', organizationId)
      .select('id')
      .first()
    if (invoice) return 'invoices'

    const payment = await db
      .from('payment_transactions')
      .where('organizationId', organizationId)
      .select('id')
      .first()
    if (payment) return 'payment_transactions'

    const paidOrder = await db
      .from('billing_orders')
      .where('organizationId', organizationId)
      .where('status', 'paid')
      .select('id')
      .first()
    if (paidOrder) return 'billing_orders.paid'

    return null
  }
}
