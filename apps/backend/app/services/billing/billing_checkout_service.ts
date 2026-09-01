import BillingException from '#exceptions/billing_exception'
import { inject } from '@adonisjs/core'
import { PlanRepository } from '#repositories/plan_repository'
import {
  BillingOrderApplyService,
  type ActivateFreePlanResult,
} from '#services/billing/billing_order_apply_service'
import {
  RazorpayOrderService,
  type CreateCheckoutResult,
} from '#services/billing/razorpay_order_service'
import { isPlanCheckoutable, isPlanFreeActivatable } from '#transformers/plan_transformer'

export type BillingCheckoutParams = {
  organizationId: string
  planId: string
  actorUserId?: string | null
}

export type BillingCheckoutFreeResponse = ActivateFreePlanResult & {
  mode: 'free'
}

export type BillingCheckoutRazorpayResponse = CreateCheckoutResult & {
  mode: 'razorpay'
}

export type BillingCheckoutResponse = BillingCheckoutFreeResponse | BillingCheckoutRazorpayResponse

/**
 * Unified tenant checkout entry — branches to local free activation or Razorpay.
 */
@inject()
export class BillingCheckoutService {
  constructor(
    protected plans: PlanRepository,
    protected apply: BillingOrderApplyService,
    protected razorpay: RazorpayOrderService
  ) {}

  async checkout(params: BillingCheckoutParams): Promise<BillingCheckoutResponse> {
    const plan = await this.plans.findById(params.planId)
    if (!plan) {
      throw BillingException.planNotFound()
    }

    if (isPlanFreeActivatable(plan)) {
      const result = await this.apply.activateFreePlan(params)
      return { mode: 'free', ...result }
    }

    if (isPlanCheckoutable(plan)) {
      const result = await this.razorpay.createCheckout(params)
      return { mode: 'razorpay', ...result }
    }

    throw BillingException.planNotActivatable()
  }
}
