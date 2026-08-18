import BillingException from '#exceptions/billing_exception'
import { inject } from '@adonisjs/core'
import { insertAuthorizationAudit } from '#lib/authorization_audit'
import { createRazorpayClient, RazorpayApiError } from '#lib/razorpay/razorpay_client'
import type { RazorpayClient } from '#lib/razorpay/types'
import { PlanRepository, type PlanRow } from '#repositories/plan_repository'
import {
  OrganizationSubscriptionRepository,
  type OrganizationSubscriptionRow,
} from '#repositories/organization_subscription_repository'
import { runWithTenant } from '#services/tenant_context'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

/** Razorpay requires total_count; use a long runway for ongoing SaaS. */
const DEFAULT_TOTAL_COUNT = 120

export type StartCheckoutParams = {
  organizationId: string
  planId: string
  actorUserId?: string | null
}

export type StartCheckoutResult = {
  subscription: OrganizationSubscriptionRow
  checkoutUrl: string | null
  gatewaySubscriptionId: string
  gatewayCustomerId: string
}

type OrgBillingRow = {
  id: string
  name: string
  email: string
  phone: string | null
  gateway: string | null
  gatewayCustomerId: string | null
}

/**
 * Creates/reuses Razorpay customer + subscription and persists local billing rows.
 * Always sets notes.organizationId for webhook org resolution.
 */
@inject()
export class RazorpayCheckoutService {
  protected razorpay: RazorpayClient

  constructor(
    protected plans: PlanRepository,
    protected subscriptions: OrganizationSubscriptionRepository,
    razorpayClient?: RazorpayClient
  ) {
    this.razorpay = razorpayClient ?? createRazorpayClient()
  }

  async startCheckout(params: StartCheckoutParams): Promise<StartCheckoutResult> {
    const plan = await this.plans.findActiveCheckoutableById(params.planId)
    if (!plan) {
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
      .select('id', 'name', 'email', 'phone', 'gateway', 'gatewayCustomerId')
      .first()

    if (!org) {
      throw BillingException.organizationNotFound()
    }

    return runWithTenant(params.organizationId, async () => {
      const open = await this.subscriptions.findOpenCheckoutForOrg(params.organizationId)
      if (open?.checkoutUrl) {
        throw BillingException.checkoutInProgress()
      }

      const gatewayCustomerId = await this.#ensureCustomer(org as OrgBillingRow)

      let gatewaySubscription
      try {
        gatewaySubscription = await this.razorpay.createSubscription({
          planId: plan.gatewayPlanId!,
          customerId: gatewayCustomerId,
          totalCount: DEFAULT_TOTAL_COUNT,
          notes: {
            organizationId: params.organizationId,
            planId: plan.id,
            planCode: plan.code,
          },
        })
      } catch (error) {
        if (error instanceof RazorpayApiError) {
          throw BillingException.gatewayFailed(error.message)
        }
        throw error
      }

      const { periodStart, periodEnd, trialEndsAt, status } = this.#periodFromPlan(plan)

      const subscription = await this.subscriptions.insert({
        organizationId: params.organizationId,
        planId: plan.id,
        gateway: 'razorpay',
        gatewaySubscriptionId: gatewaySubscription.id,
        checkoutUrl: gatewaySubscription.short_url ?? null,
        status,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        trialEndsAt,
        metadata: {
          checkoutPending: true,
          razorpayStatus: gatewaySubscription.status,
        },
      })

      await insertAuthorizationAudit({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId ?? null,
        targetType: 'subscription',
        targetId: subscription.id,
        eventType: 'subscription.created',
        after: { planId: plan.id, status: subscription.status },
      })

      return {
        subscription,
        checkoutUrl: subscription.checkoutUrl,
        gatewaySubscriptionId: gatewaySubscription.id,
        gatewayCustomerId,
      }
    })
  }

  async getCurrentSubscription(
    organizationId: string
  ): Promise<OrganizationSubscriptionRow | null> {
    return runWithTenant(organizationId, async () => {
      return this.subscriptions.findCurrentForEntitlements(organizationId)
    })
  }

  async #ensureCustomer(org: OrgBillingRow): Promise<string> {
    if (org.gateway === 'razorpay' && org.gatewayCustomerId) {
      return org.gatewayCustomerId
    }

    let customer
    try {
      customer = await this.razorpay.createCustomer({
        name: org.name,
        email: org.email,
        contact: org.phone,
        failExisting: '0',
        notes: {
          organizationId: org.id,
        },
      })
    } catch (error) {
      if (error instanceof RazorpayApiError) {
        throw BillingException.gatewayFailed(error.message)
      }
      throw error
    }

    await db.from('organizations').where('id', org.id).update({
      gateway: 'razorpay',
      gatewayCustomerId: customer.id,
    })

    return customer.id
  }

  #periodFromPlan(plan: PlanRow): {
    periodStart: Date
    periodEnd: Date
    trialEndsAt: Date | null
    status: string
  } {
    const start = DateTime.utc()
    const intervalCount = Math.max(1, plan.billingIntervalCount || 1)
    const end =
      plan.billingInterval === 'year'
        ? start.plus({ years: intervalCount })
        : start.plus({ months: intervalCount })

    const trialDays = Math.max(0, plan.trialDays || 0)
    const trialEndsAt = trialDays > 0 ? start.plus({ days: trialDays }).toJSDate() : null

    return {
      periodStart: start.toJSDate(),
      periodEnd: end.toJSDate(),
      trialEndsAt,
      status: 'trialing',
    }
  }
}
