import BillingException from '#exceptions/billing_exception'
import { inject } from '@adonisjs/core'
import env from '#start/env'
import { createRazorpayClient, RazorpayApiError } from '#lib/razorpay/razorpay_client'
import type { RazorpayClient } from '#lib/razorpay/types'
import { PlanRepository, type PlanRow } from '#repositories/plan_repository'
import {
  OrganizationSubscriptionRepository,
  type OrganizationSubscriptionRow,
} from '#repositories/organization_subscription_repository'
import {
  BillingOrderRepository,
  type BillingOrderRow,
  type BillingPlanSnapshot,
} from '#repositories/billing_order_repository'
import { computeOrderPeriod, type BillingOrderPurpose } from '#services/billing/billing_period'
import { isPlanCheckoutable } from '#transformers/plan_transformer'
import { runWithTenant } from '#services/tenant_context'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

const ORDER_TTL_MINUTES = 30
const GATEWAY = 'razorpay'

export type CreateCheckoutParams = {
  organizationId: string
  planId: string
  actorUserId?: string | null
}

export type CreateCheckoutResult = {
  orderId: string
  amount: number
  currency: string
  keyId: string
  purpose: BillingOrderPurpose
  plan: { id: string; code: string; name: string; price: number }
  prefill: { name: string; email: string; contact: string | null }
}

type OrgBillingRow = {
  id: string
  name: string
  email: string
  phone: string | null
}

function toMajorPrice(value: string | number): number {
  return typeof value === 'number' ? value : Number(value)
}

function toDateTime(value: Date | string | null | undefined): DateTime | null {
  if (!value) return null
  if (value instanceof Date) return DateTime.fromJSDate(value).toUTC()
  const parsed = DateTime.fromISO(String(value), { zone: 'utc' })
  return parsed.isValid ? parsed : DateTime.fromJSDate(new Date(value)).toUTC()
}

/**
 * Creates or reuses a Razorpay order and a local billing_orders intent row.
 * Plan amount and period are snapshotted at order time.
 */
@inject()
export class RazorpayOrderService {
  protected razorpay: RazorpayClient

  constructor(
    protected plans: PlanRepository,
    protected subscriptions: OrganizationSubscriptionRepository,
    protected orders: BillingOrderRepository,
    razorpayClient?: RazorpayClient
  ) {
    this.razorpay = razorpayClient ?? createRazorpayClient()
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const plan = await this.plans.findActiveCheckoutableById(params.planId)
    if (!plan || !isPlanCheckoutable(plan)) {
      const existing = await this.plans.findById(params.planId)
      if (!existing) {
        throw BillingException.planNotFound()
      }
      throw BillingException.planNotCheckoutable()
    }

    const org = await db
      .from('organizations')
      .where('id', params.organizationId)
      .whereNull('deletedAt')
      .select('id', 'name', 'email', 'phone')
      .first()

    if (!org) {
      throw BillingException.organizationNotFound()
    }

    return runWithTenant(params.organizationId, async () => {
      const reusable = await this.orders.findReusableForOrg({
        organizationId: params.organizationId,
        planId: plan.id,
      })
      if (reusable) {
        return this.#toCheckoutResult(reusable, org as OrgBillingRow, plan)
      }

      const current = await this.subscriptions.findCurrentForEntitlements(params.organizationId)
      const purpose = this.#purposeFromCurrent(current, plan.id)
      const now = DateTime.utc()
      const { periodStart, periodEnd } = computeOrderPeriod({
        purpose,
        billingInterval: plan.billingInterval,
        billingIntervalCount: plan.billingIntervalCount,
        now,
        existingPeriodEnd: toDateTime(current?.currentPeriodEnd ?? null),
      })

      const price = toMajorPrice(plan.price)
      const amountInPaise = Math.round(price * 100)
      const expiresAt = now.plus({ minutes: ORDER_TTL_MINUTES })
      const receipt = `bo_${params.organizationId.slice(0, 8)}_${Date.now()}`
      const snapshot: BillingPlanSnapshot = {
        code: plan.code,
        name: plan.name,
        price,
        currency: plan.currency.toUpperCase(),
        interval: plan.billingInterval,
        intervalCount: plan.billingIntervalCount,
        limits: (plan.limits ?? {}) as Record<string, unknown>,
      }

      let gatewayOrder
      try {
        gatewayOrder = await this.razorpay.createOrder({
          amount: amountInPaise,
          currency: snapshot.currency,
          receipt,
          notes: {
            organizationId: params.organizationId,
            planId: plan.id,
            planCode: plan.code,
            purpose,
          },
        })
      } catch (error) {
        if (error instanceof RazorpayApiError) {
          throw BillingException.gatewayFailed(error.message)
        }
        throw error
      }

      const order = await this.orders.insert({
        organizationId: params.organizationId,
        planId: plan.id,
        gateway: GATEWAY,
        gatewayOrderId: gatewayOrder.id,
        purpose,
        amount: price,
        taxRate: 0,
        tax: 0,
        total: price,
        currency: snapshot.currency,
        periodStart: periodStart.toJSDate(),
        periodEnd: periodEnd.toJSDate(),
        planSnapshot: snapshot,
        receipt,
        expiresAt: expiresAt.toJSDate(),
      })

      return this.#toCheckoutResult(order, org as OrgBillingRow, plan)
    })
  }

  async getCurrentSubscription(
    organizationId: string
  ): Promise<OrganizationSubscriptionRow | null> {
    return runWithTenant(organizationId, async () => {
      return this.subscriptions.findCurrentForEntitlements(organizationId)
    })
  }

  #purposeFromCurrent(
    current: OrganizationSubscriptionRow | null,
    planId: string
  ): BillingOrderPurpose {
    if (!current) return 'new_subscription'
    if (current.planId === planId) return 'renewal'
    return 'plan_change'
  }

  #toCheckoutResult(
    order: BillingOrderRow,
    org: OrgBillingRow,
    plan: PlanRow
  ): CreateCheckoutResult {
    const total = typeof order.total === 'number' ? order.total : Number(order.total)
    return {
      orderId: order.gatewayOrderId,
      amount: Math.round(total * 100),
      currency: order.currency,
      keyId: env.get('RAZORPAY_KEY_ID'),
      purpose: order.purpose,
      plan: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        price: toMajorPrice(plan.price),
      },
      prefill: {
        name: org.name,
        email: org.email,
        contact: org.phone,
      },
    }
  }
}
