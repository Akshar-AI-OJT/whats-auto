import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import env from '#start/env'
import BillingPolicy from '#policies/billing_policy'
import BillingException from '#exceptions/billing_exception'
import { PlanService } from '#services/billing/plan_service'
import { RazorpayOrderService } from '#services/billing/razorpay_order_service'
import { BillingOrderApplyService } from '#services/billing/billing_order_apply_service'
import { billingCheckoutValidator } from '#validators/billing_checkout'
import { billingVerifyValidator } from '#validators/billing_verify'
import { verifyRazorpayPaymentSignature } from '#lib/razorpay/payment_signature'
import '#types/http'

export default class BillingController {
  /**
   * @summary List active billing plans for the tenant
   * @description Tenant-safe catalog of active SaaS plans (no gateway secrets). Requires billing:view or billing:manage.
   * @tag Billing
   * @security BearerAuth
   * @responseBody 200 - { "data": { "items": [{ "id": "uuid", "code": "growth", "checkoutable": true }] } }
   * @responseBody 403 - { "error": "Permission denied: billing:view", "code": "PERMISSION_DENIED" }
   */
  @inject()
  async listPlans({ bouncer, serialize }: HttpContext, plans: PlanService) {
    await bouncer.with(BillingPolicy).authorize('viewPlans')

    const result = await plans.listTenantPlans()
    return serialize(result)
  }

  /**
   * @summary Start Razorpay Orders API checkout for the active organization
   * @description Creates or reuses a Razorpay order; returns Checkout.js fields. Requires billing:manage.
   * @tag Billing
   * @security BearerAuth
   * @requestBody { "planId": "uuid" }
   * @responseBody 200 - { "data": { "orderId": "order_...", "amount": 249900, "currency": "INR", "keyId": "rzp_..." } }
   * @responseBody 422 - { "error": "Plan is not available for Razorpay checkout", "code": "E_BILLING_PLAN_NOT_CHECKOUTABLE" }
   * @responseBody 403 - { "error": "Permission denied: billing:manage", "code": "PERMISSION_DENIED" }
   */
  @inject()
  async checkout({ bouncer, request, serialize }: HttpContext, checkout: RazorpayOrderService) {
    await bouncer.with(BillingPolicy).authorize('checkout')

    const payload = await request.validateUsing(billingCheckoutValidator)

    const result = await checkout.createCheckout({
      organizationId: request.activeMember!.organizationId,
      planId: payload.planId,
      actorUserId: request.authUser!.id,
    })

    return serialize(result)
  }

  /**
   * @summary Verify a Razorpay Checkout.js payment and activate the stored order
   * @description HMAC-verifies order_id|payment_id. Plan and amount come from billing_orders, not the request. Requires billing:manage.
   * @tag Billing
   * @security BearerAuth
   * @requestBody { "razorpayOrderId": "order_...", "razorpayPaymentId": "pay_...", "razorpaySignature": "hex" }
   * @responseBody 200 - { "data": { "subscriptionId": "uuid", "status": "active" } }
   * @responseBody 400 - { "error": "Invalid payment signature", "code": "E_BILLING_INVALID_SIGNATURE" }
   */
  @inject()
  async verify({ bouncer, request, serialize }: HttpContext, apply: BillingOrderApplyService) {
    await bouncer.with(BillingPolicy).authorize('checkout')

    const payload = await request.validateUsing(billingVerifyValidator)
    const secret = env.get('RAZORPAY_KEY_SECRET').release()
    const valid = verifyRazorpayPaymentSignature(
      payload.razorpayOrderId,
      payload.razorpayPaymentId,
      payload.razorpaySignature,
      secret
    )
    if (!valid) {
      throw BillingException.invalidSignature()
    }

    const result = await apply.applyPaidOrder({
      gatewayOrderId: payload.razorpayOrderId,
      gatewayPaymentId: payload.razorpayPaymentId,
      source: 'verify',
      organizationId: request.activeMember!.organizationId,
    })

    if (!result) {
      throw BillingException.orderNotFound()
    }

    return serialize({
      orderId: result.orderId,
      subscriptionId: result.subscriptionId,
      invoiceId: result.invoiceId,
      alreadyApplied: result.alreadyApplied,
    })
  }

  /**
   * @summary Get current organization subscription
   * @description Returns the entitlement-relevant subscription for the active org, or null when none exists. Requires billing:view.
   * @tag Billing
   * @security BearerAuth
   * @responseBody 200 - { "data": { "id": "uuid", "planId": "uuid", "status": "active" } }
   * @responseBody 403 - { "error": "Permission denied: billing:view", "code": "PERMISSION_DENIED" }
   */
  @inject()
  async showSubscription(
    { bouncer, request, response, serialize }: HttpContext,
    checkout: RazorpayOrderService
  ) {
    await bouncer.with(BillingPolicy).authorize('viewSubscription')

    const subscription = await checkout.getCurrentSubscription(request.activeMember!.organizationId)

    if (!subscription) {
      // ApiSerializer rejects null; keep the contracted { data: null } shape.
      return response.ok({ data: null })
    }

    return serialize({
      id: subscription.id,
      organizationId: subscription.organizationId,
      planId: subscription.planId,
      status: subscription.status,
      gateway: subscription.gateway,
      gatewaySubscriptionId: subscription.gatewaySubscriptionId,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEndsAt: subscription.trialEndsAt,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      lastPaymentStatus: subscription.lastPaymentStatus,
      lastPaymentAt: subscription.lastPaymentAt,
    })
  }
}
