import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { OrganizationStatus } from '#enums/organization_status'
import { runWithTenant } from '#services/tenant_context'

const DEFAULT_PENDING_ORG_MAX_AGE_DAYS = 30

export type OnboardingCleanupResult = {
  expiredVerifications: number
  purgedOrganizations: number
  skippedOrganizations: number
}

/**
 * Daily sweep: expire abandoned pre-signup OTP rows and purge aged pending_setup orgs
 * that never paid. Guarded delete — never touches orgs with paid evidence.
 */
export class OnboardingCleanupService {
  async run(params?: {
    now?: Date
    pendingOrgMaxAgeDays?: number
  }): Promise<OnboardingCleanupResult> {
    const now = params?.now ?? new Date()
    const maxAgeDays = params?.pendingOrgMaxAgeDays ?? DEFAULT_PENDING_ORG_MAX_AGE_DAYS
    const cutoff = new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000)

    const expiredVerifications = await db
      .from('verifications')
      .where('expiresAt', '<', now)
      .delete()

    const candidates = await db
      .from('organizations')
      .where('status', OrganizationStatus.PENDING_SETUP)
      .whereNull('deletedAt')
      .where('createdAt', '<', cutoff)
      .select('id', 'slug', 'createdAt')

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
            reason: paidEvidence,
          },
          'onboarding.cleanup.skip_pending_org_with_paid_evidence'
        )
        continue
      }

      await runWithTenant(organizationId, async () => {
        await db.from('organizations').where('id', organizationId).delete()
      })
      purgedOrganizations += 1
      logger.info(
        { organizationId, slug: org.slug, createdAt: org.createdAt },
        'onboarding.cleanup.purged_pending_org'
      )
    }

    return {
      expiredVerifications: Number(expiredVerifications) || 0,
      purgedOrganizations,
      skippedOrganizations,
    }
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
