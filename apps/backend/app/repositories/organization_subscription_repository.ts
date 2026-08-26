import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export type OrganizationSubscriptionRow = {
  id: string
  organizationId: string
  planId: string
  gateway: string | null
  gatewaySubscriptionId: string | null
  checkoutUrl: string | null
  status: string
  currentPeriodStart: Date | string
  currentPeriodEnd: Date | string
  trialEndsAt: Date | string | null
  cancelAtPeriodEnd: boolean
  cancelAt: Date | string | null
  activatedAt: Date | string | null
  cancelledAt: Date | string | null
  endedAt: Date | string | null
  lastPaymentStatus: string | null
  lastPaymentAt: Date | string | null
  graceEndsAt: Date | string | null
  metadata: Record<string, unknown>
  createdAt: Date | string
  updatedAt: Date | string | null
}

export type InsertOrganizationSubscriptionParams = {
  organizationId: string
  planId: string
  gateway: string
  gatewaySubscriptionId?: string | null
  checkoutUrl?: string | null
  status: string
  currentPeriodStart: Date
  currentPeriodEnd: Date
  trialEndsAt?: Date | null
  activatedAt?: Date | null
  lastPaymentStatus?: string | null
  lastPaymentAt?: Date | null
  metadata?: Record<string, unknown>
}

type Db = typeof db | TransactionClientContract

/**
 * Tenant-scoped organization_subscriptions access. Callers must run under runWithTenant when RLS applies.
 */
export class OrganizationSubscriptionRepository {
  async findByIdForOrg(
    params: { organizationId: string; subscriptionId: string },
    client: Db = db
  ): Promise<OrganizationSubscriptionRow | null> {
    const row = await client
      .from('organization_subscriptions')
      .where('id', params.subscriptionId)
      .where('organizationId', params.organizationId)
      .first()
    return (row as OrganizationSubscriptionRow | undefined) ?? null
  }

  async findByGatewaySubscriptionId(
    params: { gateway: string; gatewaySubscriptionId: string },
    client: Db = db
  ): Promise<OrganizationSubscriptionRow | null> {
    const row = await client
      .from('organization_subscriptions')
      .where('gateway', params.gateway)
      .where('gatewaySubscriptionId', params.gatewaySubscriptionId)
      .first()
    return (row as OrganizationSubscriptionRow | undefined) ?? null
  }

  /**
   * Latest subscription that can still grant entitlements for the org.
   * past_due is entitled only while graceEndsAt is null (legacy) or still in the future.
   */
  async findCurrentForEntitlements(
    organizationId: string,
    client: Db = db,
    now: Date = new Date()
  ): Promise<OrganizationSubscriptionRow | null> {
    const row = await client
      .from('organization_subscriptions')
      .where('organizationId', organizationId)
      .where((q) => {
        q.whereIn('status', ['trialing', 'active'])
          .orWhere((inner) => {
            inner.where('status', 'past_due').where((grace) => {
              grace.whereNull('graceEndsAt').orWhere('graceEndsAt', '>', now)
            })
          })
          .orWhere((inner) => {
            inner
              .where('status', 'cancelled')
              .where('cancelAtPeriodEnd', true)
              .where('currentPeriodEnd', '>', now)
          })
      })
      .orderBy('createdAt', 'desc')
      .first()

    return (row as OrganizationSubscriptionRow | undefined) ?? null
  }

  async findOpenCheckoutForOrg(
    organizationId: string,
    client: Db = db
  ): Promise<OrganizationSubscriptionRow | null> {
    const row = await client
      .from('organization_subscriptions')
      .where('organizationId', organizationId)
      .where('gateway', 'razorpay')
      .whereNotNull('gatewaySubscriptionId')
      .whereNull('activatedAt')
      .whereIn('status', ['trialing'])
      .orderBy('createdAt', 'desc')
      .first()
    return (row as OrganizationSubscriptionRow | undefined) ?? null
  }

  async insert(
    params: InsertOrganizationSubscriptionParams,
    client: Db = db
  ): Promise<OrganizationSubscriptionRow> {
    const [created] = await client
      .table('organization_subscriptions')
      .insert({
        organizationId: params.organizationId,
        planId: params.planId,
        gateway: params.gateway,
        gatewaySubscriptionId: params.gatewaySubscriptionId ?? null,
        checkoutUrl: params.checkoutUrl ?? null,
        status: params.status,
        currentPeriodStart: params.currentPeriodStart,
        currentPeriodEnd: params.currentPeriodEnd,
        trialEndsAt: params.trialEndsAt ?? null,
        cancelAtPeriodEnd: false,
        activatedAt: params.activatedAt ?? null,
        lastPaymentStatus: params.lastPaymentStatus ?? null,
        lastPaymentAt: params.lastPaymentAt ?? null,
        metadata: params.metadata ?? {},
      })
      .returning('*')

    return created as OrganizationSubscriptionRow
  }

  async updateById(
    params: {
      organizationId: string
      subscriptionId: string
      patch: Record<string, unknown>
    },
    client: Db = db
  ): Promise<OrganizationSubscriptionRow | null> {
    const [updated] = await client
      .from('organization_subscriptions')
      .where('id', params.subscriptionId)
      .where('organizationId', params.organizationId)
      .update(params.patch)
      .returning('*')

    return (updated as OrganizationSubscriptionRow | undefined) ?? null
  }

  async listActivePastPeriodEnd(
    params: { organizationId: string; now?: Date; limit?: number },
    client: Db = db
  ): Promise<OrganizationSubscriptionRow[]> {
    const now = params.now ?? new Date()
    const rows = await client
      .from('organization_subscriptions')
      .where('organizationId', params.organizationId)
      .where('status', 'active')
      .where('currentPeriodEnd', '<=', now)
      .orderBy('currentPeriodEnd', 'asc')
      .limit(params.limit ?? 100)
    return rows as OrganizationSubscriptionRow[]
  }

  async listPastDuePastGrace(
    params: { organizationId: string; now?: Date; limit?: number },
    client: Db = db
  ): Promise<OrganizationSubscriptionRow[]> {
    const now = params.now ?? new Date()
    const rows = await client
      .from('organization_subscriptions')
      .where('organizationId', params.organizationId)
      .where('status', 'past_due')
      .whereNotNull('graceEndsAt')
      .where('graceEndsAt', '<=', now)
      .orderBy('graceEndsAt', 'asc')
      .limit(params.limit ?? 100)
    return rows as OrganizationSubscriptionRow[]
  }

  async listDueForRenewalReminder(
    params: { organizationId: string; now?: Date; windowEnd: Date; limit?: number },
    client: Db = db
  ): Promise<OrganizationSubscriptionRow[]> {
    const now = params.now ?? new Date()
    const rows = await client
      .from('organization_subscriptions')
      .where('organizationId', params.organizationId)
      .where('status', 'active')
      .where('currentPeriodEnd', '>', now)
      .where('currentPeriodEnd', '<=', params.windowEnd)
      .orderBy('currentPeriodEnd', 'asc')
      .limit(params.limit ?? 100)
    return rows as OrganizationSubscriptionRow[]
  }
}
