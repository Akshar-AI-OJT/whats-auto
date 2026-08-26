import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { BillingOrderPurpose } from '#services/billing/billing_period'

export type BillingOrderStatus = 'created' | 'paid' | 'failed' | 'expired' | 'cancelled'

export type BillingPlanSnapshot = {
  code: string
  name: string
  price: number
  currency: string
  interval: string
  intervalCount: number
  limits: Record<string, unknown>
}

export type BillingOrderRow = {
  id: string
  organizationId: string
  planId: string
  subscriptionId: string | null
  gateway: string
  gatewayOrderId: string
  purpose: BillingOrderPurpose
  status: string
  amount: string | number
  taxRate: string | number
  tax: string | number
  total: string | number
  currency: string
  periodStart: Date | string
  periodEnd: Date | string
  planSnapshot: BillingPlanSnapshot
  paymentTransactionId: string | null
  invoiceId: string | null
  receipt: string | null
  appliedAt: Date | string | null
  expiresAt: Date | string | null
  failureReason: string | null
  metadata: Record<string, unknown>
  createdAt: Date | string
  updatedAt: Date | string | null
}

export type InsertBillingOrderParams = {
  organizationId: string
  planId: string
  gateway?: string
  gatewayOrderId: string
  purpose: BillingOrderPurpose
  status?: BillingOrderStatus
  amount: number
  taxRate?: number
  tax?: number
  total: number
  currency: string
  periodStart: Date
  periodEnd: Date
  planSnapshot: BillingPlanSnapshot
  receipt?: string | null
  expiresAt?: Date | null
  metadata?: Record<string, unknown>
}

type Db = typeof db | TransactionClientContract

/**
 * Tenant-scoped billing_orders access. Callers must run under runWithTenant when RLS applies.
 */
export class BillingOrderRepository {
  async insert(params: InsertBillingOrderParams, client: Db = db): Promise<BillingOrderRow> {
    const [created] = await client
      .table('billing_orders')
      .insert({
        organizationId: params.organizationId,
        planId: params.planId,
        gateway: params.gateway ?? 'razorpay',
        gatewayOrderId: params.gatewayOrderId,
        purpose: params.purpose,
        status: params.status ?? 'created',
        amount: params.amount,
        taxRate: params.taxRate ?? 0,
        tax: params.tax ?? 0,
        total: params.total,
        currency: params.currency,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        planSnapshot: params.planSnapshot,
        receipt: params.receipt ?? null,
        expiresAt: params.expiresAt ?? null,
        metadata: params.metadata ?? {},
      })
      .returning('*')

    return created as BillingOrderRow
  }

  async findByGatewayOrderId(
    params: { gateway: string; gatewayOrderId: string },
    client: Db = db
  ): Promise<BillingOrderRow | null> {
    const row = await client
      .from('billing_orders')
      .where('gateway', params.gateway)
      .where('gatewayOrderId', params.gatewayOrderId)
      .first()
    return (row as BillingOrderRow | undefined) ?? null
  }

  /**
   * Reuse an unexpired created order for the same org + plan instead of opening a second checkout.
   */
  async findReusableForOrg(
    params: { organizationId: string; planId: string; now?: Date },
    client: Db = db
  ): Promise<BillingOrderRow | null> {
    const now = params.now ?? new Date()
    const row = await client
      .from('billing_orders')
      .where('organizationId', params.organizationId)
      .where('planId', params.planId)
      .where('status', 'created')
      .where((q) => {
        q.whereNull('expiresAt').orWhere('expiresAt', '>', now)
      })
      .orderBy('createdAt', 'desc')
      .first()
    return (row as BillingOrderRow | undefined) ?? null
  }

  async claimForUpdate(
    params: { gateway: string; gatewayOrderId: string },
    client: Db = db
  ): Promise<BillingOrderRow | null> {
    const row = await client
      .from('billing_orders')
      .where('gateway', params.gateway)
      .where('gatewayOrderId', params.gatewayOrderId)
      .forUpdate()
      .first()
    return (row as BillingOrderRow | undefined) ?? null
  }

  async updateById(
    params: { organizationId: string; orderId: string; patch: Record<string, unknown> },
    client: Db = db
  ): Promise<BillingOrderRow | null> {
    const [updated] = await client
      .from('billing_orders')
      .where('id', params.orderId)
      .where('organizationId', params.organizationId)
      .update(params.patch)
      .returning('*')
    return (updated as BillingOrderRow | undefined) ?? null
  }

  async listCreatedExpired(
    params: { organizationId: string; now?: Date; limit?: number },
    client: Db = db
  ): Promise<BillingOrderRow[]> {
    const now = params.now ?? new Date()
    const rows = await client
      .from('billing_orders')
      .where('organizationId', params.organizationId)
      .where('status', 'created')
      .whereNotNull('expiresAt')
      .where('expiresAt', '<=', now)
      .orderBy('expiresAt', 'asc')
      .limit(params.limit ?? 100)
    return rows as BillingOrderRow[]
  }
}
