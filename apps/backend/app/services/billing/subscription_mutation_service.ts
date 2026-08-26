import db from '@adonisjs/lucid/services/db'
import { insertAuthorizationAudit } from '#lib/authorization_audit'
import {
  OrganizationSubscriptionRepository,
  type OrganizationSubscriptionRow,
} from '#repositories/organization_subscription_repository'
import { PaymentTransactionRepository } from '#repositories/payment_transaction_repository'
import { BillingOrderRepository } from '#repositories/billing_order_repository'
import { BillingOrderApplyService } from '#services/billing/billing_order_apply_service'
import { notifyBillingOwnerBestEffort } from '#services/billing/billing_owner_notify'
import { OrganizationService } from '#services/organization_service'
import { runWithTenant } from '#services/tenant_context'

export const HANDLED_RAZORPAY_EVENTS = [
  'order.paid',
  'payment.captured',
  'payment.failed',
  'subscription.charged',
  'subscription.halted',
  'subscription.cancelled',
] as const

export type HandledRazorpayEvent = (typeof HANDLED_RAZORPAY_EVENTS)[number]

export type MutationResult =
  | { outcome: 'ignored'; reason: string }
  | { outcome: 'applied'; organizationId: string; subscriptionId?: string | null }

type RazorpayEntity = Record<string, unknown>

/**
 * Applies idempotent subscription/payment mutations from a verified Razorpay event payload.
 * No outbound Razorpay HTTP.
 */
export class SubscriptionMutationService {
  constructor(
    protected subscriptions: OrganizationSubscriptionRepository = new OrganizationSubscriptionRepository(),
    protected payments: PaymentTransactionRepository = new PaymentTransactionRepository(),
    protected orders: BillingOrderRepository = new BillingOrderRepository(),
    protected applyService: BillingOrderApplyService = new BillingOrderApplyService()
  ) {}

  isHandledEvent(eventType: string): eventType is HandledRazorpayEvent {
    return (HANDLED_RAZORPAY_EVENTS as readonly string[]).includes(eventType)
  }

  async applyEvent(params: {
    eventType: string
    payload: Record<string, unknown>
  }): Promise<MutationResult> {
    if (!this.isHandledEvent(params.eventType)) {
      return { outcome: 'ignored', reason: `unhandled_event:${params.eventType}` }
    }

    const organizationId = await this.resolveOrganizationId(params.payload, params.eventType)
    if (!organizationId) {
      return { outcome: 'ignored', reason: 'unresolvable_organization' }
    }

    return runWithTenant(organizationId, async () => {
      switch (params.eventType) {
        case 'order.paid':
          return this.#onOrderPaid(organizationId, params.payload)
        case 'payment.captured':
          return this.#onPaymentCaptured(organizationId, params.payload)
        case 'payment.failed':
          return this.#onPaymentFailed(organizationId, params.payload)
        case 'subscription.charged':
          return this.#onSubscriptionCharged(organizationId, params.payload)
        case 'subscription.halted':
          return this.#onSubscriptionHalted(organizationId, params.payload)
        case 'subscription.cancelled':
          return this.#onSubscriptionCancelled(organizationId, params.payload)
        default:
          return { outcome: 'ignored', reason: `unhandled_event:${params.eventType}` }
      }
    })
  }

  async resolveOrganizationId(
    payload: Record<string, unknown>,
    eventType: string
  ): Promise<string | null> {
    const entity = this.#primaryEntity(payload, eventType)
    const notes = this.#asNotes(entity?.notes)
    if (notes.organizationId && this.#isUuid(notes.organizationId)) {
      return notes.organizationId
    }

    if (eventType === 'payment.failed' || eventType === 'payment.captured') {
      const orderId = this.#asString(entity?.order_id)
      if (orderId) {
        const order = await this.orders.findByGatewayOrderId({
          gateway: 'razorpay',
          gatewayOrderId: orderId,
        })
        if (order) {
          return order.organizationId
        }
      }
    }

    const subscriptionId = this.#subscriptionIdFromPayload(payload, eventType, entity)
    if (subscriptionId) {
      const sub = await this.subscriptions.findByGatewaySubscriptionId({
        gateway: 'razorpay',
        gatewaySubscriptionId: subscriptionId,
      })
      if (sub) {
        return sub.organizationId
      }
    }

    const customerId = this.#asString(entity?.customer_id)
    if (customerId) {
      const org = await db
        .from('organizations')
        .where('gateway', 'razorpay')
        .where('gatewayCustomerId', customerId)
        .whereNull('deletedAt')
        .select('id')
        .first()
      if (org?.id) {
        return org.id as string
      }
    }

    return null
  }

  async #onOrderPaid(
    organizationId: string,
    payload: Record<string, unknown>
  ): Promise<MutationResult> {
    const orderEntity = this.#entityAt(payload, 'order')
    const gatewayOrderId = this.#asString(orderEntity?.id)
    if (!gatewayOrderId) {
      return { outcome: 'ignored', reason: 'missing_order_id' }
    }

    const payment = this.#entityAt(payload, 'payment')
    const gatewayPaymentId = this.#asString(payment?.id)
    if (!gatewayPaymentId) {
      return { outcome: 'ignored', reason: 'missing_payment_id' }
    }

    const result = await this.applyService.applyPaidOrder({
      gatewayOrderId,
      gatewayPaymentId,
      paymentMethod: this.#asString(payment?.method),
      paidAt: this.#unixToDate(payment?.captured_at) ?? new Date(),
      source: 'webhook',
      organizationId,
    })

    if (!result) {
      return { outcome: 'ignored', reason: 'billing_order_not_found' }
    }

    return { outcome: 'applied', organizationId, subscriptionId: result.subscriptionId }
  }

  async #onPaymentCaptured(
    organizationId: string,
    payload: Record<string, unknown>
  ): Promise<MutationResult> {
    const payment = this.#entityAt(payload, 'payment')
    if (!payment) {
      return { outcome: 'ignored', reason: 'missing_payment_entity' }
    }

    const gatewayPaymentId = this.#asString(payment.id)
    if (!gatewayPaymentId) {
      return { outcome: 'ignored', reason: 'missing_payment_id' }
    }

    const subscription = await this.#findSubscriptionForPayment(organizationId, payload, payment)

    await this.payments.upsertByGatewayPaymentId({
      organizationId,
      subscriptionId: subscription?.id ?? null,
      gateway: 'razorpay',
      gatewayPaymentId,
      gatewayOrderId: this.#asString(payment.order_id),
      gatewayInvoiceId: this.#asString(payment.invoice_id),
      amount: this.#paiseToMajor(payment.amount),
      currency: (this.#asString(payment.currency) ?? 'INR').toUpperCase(),
      status: 'captured',
      paymentMethod: this.#asString(payment.method),
      paidAt: this.#unixToDate(payment.captured_at) ?? new Date(),
    })

    if (subscription) {
      await this.subscriptions.updateById({
        organizationId,
        subscriptionId: subscription.id,
        patch: {
          lastPaymentStatus: 'captured',
          lastPaymentAt: new Date(),
        },
      })
    }

    return { outcome: 'applied', organizationId, subscriptionId: subscription?.id ?? null }
  }

  async #onPaymentFailed(
    organizationId: string,
    payload: Record<string, unknown>
  ): Promise<MutationResult> {
    const payment = this.#entityAt(payload, 'payment')
    if (!payment) {
      return { outcome: 'ignored', reason: 'missing_payment_entity' }
    }

    const gatewayPaymentId = this.#asString(payment.id)
    if (!gatewayPaymentId) {
      return { outcome: 'ignored', reason: 'missing_payment_id' }
    }

    const subscription = await this.#findSubscriptionForPayment(organizationId, payload, payment)

    const gatewayOrderId = this.#asString(payment.order_id)
    if (gatewayOrderId) {
      const billingOrder = await this.orders.findByGatewayOrderId({
        gateway: 'razorpay',
        gatewayOrderId,
      })
      if (billingOrder && billingOrder.status === 'created') {
        await this.orders.updateById({
          organizationId: billingOrder.organizationId,
          orderId: billingOrder.id,
          patch: {
            status: 'failed',
            failureReason: this.#asString(payment.error_description),
          },
        })
      }
    }

    const existingPayment = await this.payments.findByGatewayPaymentId({
      gateway: 'razorpay',
      gatewayPaymentId,
    })
    const alreadyFailed = existingPayment?.status === 'failed'

    await this.payments.upsertByGatewayPaymentId({
      organizationId,
      subscriptionId: subscription?.id ?? null,
      gateway: 'razorpay',
      gatewayPaymentId,
      gatewayOrderId: this.#asString(payment.order_id),
      gatewayInvoiceId: this.#asString(payment.invoice_id),
      amount: this.#paiseToMajor(payment.amount),
      currency: (this.#asString(payment.currency) ?? 'INR').toUpperCase(),
      status: 'failed',
      paymentMethod: this.#asString(payment.method),
      failureCode: this.#asString(payment.error_code),
      failureReason: this.#asString(payment.error_description),
    })

    if (subscription && (subscription.status === 'active' || subscription.status === 'trialing')) {
      await this.subscriptions.updateById({
        organizationId,
        subscriptionId: subscription.id,
        patch: {
          status: 'past_due',
          lastPaymentStatus: 'failed',
          lastPaymentAt: new Date(),
        },
      })

      await notifyBillingOwnerBestEffort({
        organizationId,
        type: 'billing_subscription_past_due',
        title: 'Subscription past due',
        body: 'Your subscription is past due. Renew payment to restore full access.',
      })
    }

    // Webhook retries for the same gateway payment id must not re-notify.
    if (!alreadyFailed) {
      await notifyBillingOwnerBestEffort({
        organizationId,
        type: 'billing_payment_failed',
        title: 'Payment failed',
        body: 'A subscription payment failed. Update your payment method to avoid interruption.',
      })
    }

    return { outcome: 'applied', organizationId, subscriptionId: subscription?.id ?? null }
  }

  async #onSubscriptionCharged(
    organizationId: string,
    payload: Record<string, unknown>
  ): Promise<MutationResult> {
    const subscriptionEntity = this.#entityAt(payload, 'subscription')
    const gatewaySubscriptionId = this.#asString(subscriptionEntity?.id)
    if (!gatewaySubscriptionId) {
      return { outcome: 'ignored', reason: 'missing_subscription_id' }
    }

    const subscription = await this.subscriptions.findByGatewaySubscriptionId({
      gateway: 'razorpay',
      gatewaySubscriptionId,
    })
    if (!subscription || subscription.organizationId !== organizationId) {
      return { outcome: 'ignored', reason: 'subscription_not_found' }
    }
    if (subscription.status === 'cancelled' || subscription.status === 'expired') {
      return { outcome: 'applied', organizationId, subscriptionId: subscription.id }
    }

    const periodStart = this.#unixToDate(subscriptionEntity?.current_start)
    const periodEnd = this.#unixToDate(subscriptionEntity?.current_end)

    const patch: Record<string, unknown> = {
      status: 'active',
      lastPaymentStatus: 'captured',
      lastPaymentAt: new Date(),
      checkoutUrl: null,
      metadata: {
        ...(typeof subscription.metadata === 'object' && subscription.metadata
          ? subscription.metadata
          : {}),
        checkoutPending: false,
      },
    }
    if (!subscription.activatedAt) {
      patch.activatedAt = new Date()
    }
    if (periodStart) patch.currentPeriodStart = periodStart
    if (periodEnd) patch.currentPeriodEnd = periodEnd

    await this.subscriptions.updateById({
      organizationId,
      subscriptionId: subscription.id,
      patch,
    })

    await new OrganizationService().promoteToActive(organizationId)

    const payment = this.#entityAt(payload, 'payment')
    const gatewayPaymentId = this.#asString(payment?.id)
    if (payment && gatewayPaymentId) {
      await this.payments.upsertByGatewayPaymentId({
        organizationId,
        subscriptionId: subscription.id,
        gateway: 'razorpay',
        gatewayPaymentId,
        gatewayOrderId: this.#asString(payment.order_id),
        gatewayInvoiceId: this.#asString(payment.invoice_id),
        amount: this.#paiseToMajor(payment.amount),
        currency: (this.#asString(payment.currency) ?? 'INR').toUpperCase(),
        status: 'captured',
        paymentMethod: this.#asString(payment.method),
        paidAt: this.#unixToDate(payment.captured_at) ?? new Date(),
      })
    }

    return { outcome: 'applied', organizationId, subscriptionId: subscription.id }
  }

  async #onSubscriptionHalted(
    organizationId: string,
    payload: Record<string, unknown>
  ): Promise<MutationResult> {
    const subscriptionEntity = this.#entityAt(payload, 'subscription')
    const gatewaySubscriptionId = this.#asString(subscriptionEntity?.id)
    if (!gatewaySubscriptionId) {
      return { outcome: 'ignored', reason: 'missing_subscription_id' }
    }

    const subscription = await this.subscriptions.findByGatewaySubscriptionId({
      gateway: 'razorpay',
      gatewaySubscriptionId,
    })
    if (!subscription || subscription.organizationId !== organizationId) {
      return { outcome: 'ignored', reason: 'subscription_not_found' }
    }

    const wasAlreadyPastDue = subscription.status === 'past_due'
    const priorMetadata =
      typeof subscription.metadata === 'object' && subscription.metadata
        ? (subscription.metadata as Record<string, unknown>)
        : {}
    const wasAlreadyHalted = priorMetadata.halted === true

    await this.subscriptions.updateById({
      organizationId,
      subscriptionId: subscription.id,
      patch: {
        status: 'past_due',
        lastPaymentStatus: 'failed',
        lastPaymentAt: new Date(),
        metadata: {
          ...priorMetadata,
          halted: true,
        },
      },
    })

    if (!wasAlreadyPastDue) {
      await notifyBillingOwnerBestEffort({
        organizationId,
        type: 'billing_subscription_past_due',
        title: 'Subscription past due',
        body: 'Your subscription is past due. Renew payment to restore full access.',
      })
    }

    if (!wasAlreadyHalted) {
      await notifyBillingOwnerBestEffort({
        organizationId,
        type: 'billing_subscription_halted',
        title: 'Subscription halted',
        body: 'Your subscription was halted by the payment provider after repeated failures.',
      })
    }

    return { outcome: 'applied', organizationId, subscriptionId: subscription.id }
  }

  async #onSubscriptionCancelled(
    organizationId: string,
    payload: Record<string, unknown>
  ): Promise<MutationResult> {
    const subscriptionEntity = this.#entityAt(payload, 'subscription')
    const gatewaySubscriptionId = this.#asString(subscriptionEntity?.id)
    if (!gatewaySubscriptionId) {
      return { outcome: 'ignored', reason: 'missing_subscription_id' }
    }

    const subscription = await this.subscriptions.findByGatewaySubscriptionId({
      gateway: 'razorpay',
      gatewaySubscriptionId,
    })
    if (!subscription || subscription.organizationId !== organizationId) {
      return { outcome: 'ignored', reason: 'subscription_not_found' }
    }

    const now = new Date()
    const periodEnd = new Date(subscription.currentPeriodEnd)
    const atPeriodEnd = subscription.cancelAtPeriodEnd && periodEnd > now

    if (atPeriodEnd) {
      await this.subscriptions.updateById({
        organizationId,
        subscriptionId: subscription.id,
        patch: {
          cancelledAt: now,
          cancelAtPeriodEnd: true,
          // keep status active/past_due until period end
          status: subscription.status === 'past_due' ? 'past_due' : 'active',
        },
      })
    } else {
      await this.subscriptions.updateById({
        organizationId,
        subscriptionId: subscription.id,
        patch: {
          status: 'cancelled',
          cancelledAt: now,
          endedAt: now,
          cancelAtPeriodEnd: false,
        },
      })

      // Hard cancel only — skip cancel-at-period-end and already-cancelled retries.
      if (subscription.status !== 'cancelled') {
        await insertAuthorizationAudit({
          organizationId,
          actorUserId: null,
          targetType: 'subscription',
          targetId: subscription.id,
          eventType: 'subscription.cancelled',
          after: { status: 'cancelled' },
        })
        await notifyBillingOwnerBestEffort({
          organizationId,
          type: 'billing_subscription_cancelled',
          title: 'Subscription cancelled',
          body: 'Your subscription has been cancelled.',
        })
      }
    }

    return { outcome: 'applied', organizationId, subscriptionId: subscription.id }
  }

  async #findSubscriptionForPayment(
    organizationId: string,
    payload: Record<string, unknown>,
    payment: RazorpayEntity
  ): Promise<OrganizationSubscriptionRow | null> {
    const gatewaySubscriptionId =
      this.#asString(payment.subscription_id) ??
      this.#asString(this.#entityAt(payload, 'subscription')?.id)

    if (gatewaySubscriptionId) {
      const sub = await this.subscriptions.findByGatewaySubscriptionId({
        gateway: 'razorpay',
        gatewaySubscriptionId,
      })
      if (sub && sub.organizationId === organizationId) {
        return sub
      }
    }

    return this.subscriptions.findCurrentForEntitlements(organizationId)
  }

  #primaryEntity(payload: Record<string, unknown>, eventType: string): RazorpayEntity | null {
    if (eventType.startsWith('payment.')) {
      return this.#entityAt(payload, 'payment')
    }
    if (eventType.startsWith('subscription.')) {
      return this.#entityAt(payload, 'subscription')
    }
    if (eventType.startsWith('order.')) {
      return this.#entityAt(payload, 'order')
    }
    return null
  }

  #subscriptionIdFromPayload(
    payload: Record<string, unknown>,
    eventType: string,
    entity: RazorpayEntity | null
  ): string | null {
    if (eventType.startsWith('subscription.')) {
      return this.#asString(entity?.id)
    }
    return (
      this.#asString(entity?.subscription_id) ??
      this.#asString(this.#entityAt(payload, 'subscription')?.id)
    )
  }

  #entityAt(payload: Record<string, unknown>, key: string): RazorpayEntity | null {
    const inner = payload.payload
    if (!inner || typeof inner !== 'object') {
      return null
    }
    const bucket = (inner as Record<string, unknown>)[key]
    if (!bucket || typeof bucket !== 'object') {
      return null
    }
    const entity = (bucket as Record<string, unknown>).entity
    if (!entity || typeof entity !== 'object') {
      return null
    }
    return entity as RazorpayEntity
  }

  #asNotes(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object') {
      return {}
    }
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'string') {
        out[k] = v
      }
    }
    return out
  }

  #asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null
  }

  #isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  }

  #paiseToMajor(amount: unknown): number {
    const n = typeof amount === 'number' ? amount : Number(amount)
    if (!Number.isFinite(n)) {
      return 0.01
    }
    return Math.max(0.01, n / 100)
  }

  #unixToDate(value: unknown): Date | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null
    }
    return new Date(value * 1000)
  }
}
