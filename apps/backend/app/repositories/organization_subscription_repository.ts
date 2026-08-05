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
  metadata: Record<string, unknown>
  createdAt: Date | string
  updatedAt: Date | string | null
}

export type InsertOrganizationSubscriptionParams = {
  organizationId: string
  planId: string
  gateway: string
  gatewaySubscriptionId: string
  checkoutUrl: string | null
  status: string
  currentPeriodStart: Date
  currentPeriodEnd: Date
  trialEndsAt?: Date | null
  metadata?: Record<string, unknown>
}

type Db = typeof db | TransactionClientContract

const ENTITLED_STATUSES = ['trialing', 'active', 'past_due'] as const

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
        q.whereIn('status', [...ENTITLED_STATUSES]).orWhere((inner) => {
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
        gatewaySubscriptionId: params.gatewaySubscriptionId,
        checkoutUrl: params.checkoutUrl,
        status: params.status,
        currentPeriodStart: params.currentPeriodStart,
        currentPeriodEnd: params.currentPeriodEnd,
        trialEndsAt: params.trialEndsAt ?? null,
        cancelAtPeriodEnd: false,
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
}
