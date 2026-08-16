import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import BillingPolicy from '#policies/billing_policy'
import { RazorpayCheckoutService } from '#services/billing/razorpay_checkout_service'
import { billingCheckoutValidator } from '#validators/billing_checkout'
import '#types/http'

export default class BillingController {
  /**
   * @summary Start Razorpay checkout for the active organization
   * @description Creates/reuses a Razorpay customer and subscription; returns hosted checkoutUrl. Requires billing:manage.
   * @tag Billing
   * @security BearerAuth
   * @requestBody { "planId": "uuid" }
   * @responseBody 200 - { "data": { "subscriptionId": "uuid", "checkoutUrl": "https://rzp.io/...", "gatewaySubscriptionId": "sub_...", "status": "trialing" } }
   * @responseBody 422 - { "error": "Plan is not available for Razorpay checkout", "code": "E_BILLING_PLAN_NOT_CHECKOUTABLE" }
   * @responseBody 403 - { "error": "Permission denied: billing:manage", "code": "PERMISSION_DENIED" }
   */
  @inject()
  async checkout({ bouncer, request, serialize }: HttpContext, checkout: RazorpayCheckoutService) {
    await bouncer.with(BillingPolicy).authorize('checkout')

    const payload = await request.validateUsing(billingCheckoutValidator)

    const result = await checkout.startCheckout({
      organizationId: request.activeMember!.organizationId,
      planId: payload.planId,
    })

    return serialize({
      subscriptionId: result.subscription.id,
      planId: result.subscription.planId,
      status: result.subscription.status,
      checkoutUrl: result.checkoutUrl,
      gatewaySubscriptionId: result.gatewaySubscriptionId,
      gatewayCustomerId: result.gatewayCustomerId,
      currentPeriodStart: result.subscription.currentPeriodStart,
      currentPeriodEnd: result.subscription.currentPeriodEnd,
    })
  }

  /**
   * @summary Get current organization subscription
   * @description Returns the entitlement-relevant subscription for the active org, or null when none exists. Requires billing:view.
   * @tag Billing
   * @security BearerAuth
   * @responseBody 200 - { "data": { "id": "uuid", "planId": "uuid", "status": "active" } }
   * @responseBody 200 - { "data": null }
   * @responseBody 403 - { "error": "Permission denied: billing:view", "code": "PERMISSION_DENIED" }
   */
  @inject()
  async showSubscription(
    { bouncer, request, serialize }: HttpContext,
    checkout: RazorpayCheckoutService
  ) {
    await bouncer.with(BillingPolicy).authorize('viewSubscription')

    const subscription = await checkout.getCurrentSubscription(request.activeMember!.organizationId)

    if (!subscription) {
      return serialize(null)
    }

    return serialize({
      id: subscription.id,
      organizationId: subscription.organizationId,
      planId: subscription.planId,
      status: subscription.status,
      gateway: subscription.gateway,
      gatewaySubscriptionId: subscription.gatewaySubscriptionId,
      checkoutUrl: subscription.checkoutUrl,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEndsAt: subscription.trialEndsAt,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      lastPaymentStatus: subscription.lastPaymentStatus,
      lastPaymentAt: subscription.lastPaymentAt,
    })
  }
}
