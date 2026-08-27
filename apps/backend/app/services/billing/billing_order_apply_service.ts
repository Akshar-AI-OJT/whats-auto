import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { insertAuthorizationAudit } from '#lib/authorization_audit'
import { formatOrganizationAddress } from '#lib/organization_address'
import {
  BillingOrderRepository,
  type BillingOrderRow,
  type BillingPlanSnapshot,
} from '#repositories/billing_order_repository'
import {
  OrganizationSubscriptionRepository,
  type OrganizationSubscriptionRow,
} from '#repositories/organization_subscription_repository'
import { PaymentTransactionRepository } from '#repositories/payment_transaction_repository'
import { InvoiceRepository } from '#repositories/invoice_repository'
import { notifyBillingOwnerBestEffort } from '#services/billing/billing_owner_notify'
import { OrganizationService } from '#services/organization_service'
import { runWithTenant } from '#services/tenant_context'
import { deriveBillingPeriod } from '#transformers/plan_transformer'
import { computeInvoiceTotals, formatInvoiceNumber } from '#transformers/invoice_transformer'
import type { InvoiceBillingPeriod } from '#types/invoices'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

const GATEWAY = 'razorpay'
/** Arbitrary int4 key so invoice-number locks do not collide with other advisory locks. */
const INVOICE_NUMBER_LOCK_NS = 872514

export type ApplyPaidOrderParams = {
  gatewayOrderId: string
  gatewayPaymentId: string
  paymentMethod?: string | null
  paidAt?: Date
  source: 'verify' | 'webhook'
  /** When set, the order must belong to this org (client-verify path). */
  organizationId?: string
}

export type ApplyPaidOrderResult = {
  organizationId: string
  orderId: string
  subscriptionId: string
  invoiceId: string
  alreadyApplied: boolean
}

function toNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number(value)
}

function toJsDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function asSnapshot(value: unknown): BillingPlanSnapshot {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    code: typeof raw.code === 'string' ? raw.code : '',
    name: typeof raw.name === 'string' ? raw.name : 'Plan',
    price: typeof raw.price === 'number' ? raw.price : Number(raw.price ?? 0),
    currency: typeof raw.currency === 'string' ? raw.currency : 'INR',
    interval: typeof raw.interval === 'string' ? raw.interval : 'month',
    intervalCount:
      typeof raw.intervalCount === 'number' ? raw.intervalCount : Number(raw.intervalCount ?? 1),
    limits:
      raw.limits && typeof raw.limits === 'object' && !Array.isArray(raw.limits)
        ? (raw.limits as Record<string, unknown>)
        : {},
  }
}

function billingPeriodFromSnapshot(snapshot: BillingPlanSnapshot): InvoiceBillingPeriod {
  return deriveBillingPeriod({
    billingInterval: snapshot.interval,
    metadata: {},
  })
}

/**
 * Single idempotent write path for a paid Razorpay order.
 * Client-verify and order.paid webhook both call this.
 */
@inject()
export class BillingOrderApplyService {
  constructor(
    protected orders: BillingOrderRepository = new BillingOrderRepository(),
    protected subscriptions: OrganizationSubscriptionRepository = new OrganizationSubscriptionRepository(),
    protected payments: PaymentTransactionRepository = new PaymentTransactionRepository(),
    protected invoices: InvoiceRepository = new InvoiceRepository()
  ) {}

  async applyPaidOrder(params: ApplyPaidOrderParams): Promise<ApplyPaidOrderResult | null> {
    const preview = await this.orders.findByGatewayOrderId({
      gateway: GATEWAY,
      gatewayOrderId: params.gatewayOrderId,
    })
    if (!preview) {
      return null
    }
    if (params.organizationId && preview.organizationId !== params.organizationId) {
      return null
    }

    return runWithTenant(preview.organizationId, async () => {
      const result = await db.transaction(async (trx) => {
        const order = await this.orders.claimForUpdate(
          { gateway: GATEWAY, gatewayOrderId: params.gatewayOrderId },
          trx
        )
        if (!order) {
          return null
        }
        if (params.organizationId && order.organizationId !== params.organizationId) {
          return null
        }

        if (order.status === 'paid' && order.subscriptionId && order.invoiceId) {
          return {
            organizationId: order.organizationId,
            orderId: order.id,
            subscriptionId: order.subscriptionId,
            invoiceId: order.invoiceId,
            alreadyApplied: true,
          }
        }

        const paidAt = params.paidAt ?? new Date()
        const snapshot = asSnapshot(order.planSnapshot)
        const subscription = await this.#extendOrInsertSubscription(order, snapshot, paidAt, trx)

        const payment = await this.payments.upsertByGatewayPaymentId(
          {
            organizationId: order.organizationId,
            subscriptionId: subscription.id,
            gateway: GATEWAY,
            gatewayPaymentId: params.gatewayPaymentId,
            gatewayOrderId: params.gatewayOrderId,
            amount: toNumber(order.total),
            currency: order.currency,
            status: 'captured',
            paymentMethod: params.paymentMethod ?? null,
            paidAt,
          },
          trx
        )

        const invoice = await this.#issuePaidInvoice({
          order,
          snapshot,
          subscriptionId: subscription.id,
          paymentTransactionId: payment.id,
          paymentMethod: params.paymentMethod ?? null,
          paidAt,
          trx,
        })

        const updated = await this.orders.updateById(
          {
            organizationId: order.organizationId,
            orderId: order.id,
            patch: {
              status: 'paid',
              subscriptionId: subscription.id,
              paymentTransactionId: payment.id,
              invoiceId: invoice.id,
              appliedAt: paidAt,
              failureReason: null,
            },
          },
          trx
        )

        await insertAuthorizationAudit(
          {
            organizationId: order.organizationId,
            actorUserId: null,
            targetType: 'subscription',
            targetId: subscription.id,
            eventType: 'subscription.activated',
            after: {
              planId: order.planId,
              status: 'active',
              source: params.source,
              billingOrderId: order.id,
            },
          },
          trx
        )

        await new OrganizationService().promoteToActive(order.organizationId, trx)

        return {
          organizationId: order.organizationId,
          orderId: updated?.id ?? order.id,
          subscriptionId: subscription.id,
          invoiceId: invoice.id,
          alreadyApplied: false,
        }
      })

      if (result && !result.alreadyApplied) {
        await notifyBillingOwnerBestEffort({
          organizationId: result.organizationId,
          type: 'billing_subscription_activated',
          title: 'Subscription activated',
          body: 'Your plan is now active. Thank you for your payment.',
        })
      }
      return result
    })
  }

  async #extendOrInsertSubscription(
    order: BillingOrderRow,
    snapshot: BillingPlanSnapshot,
    paidAt: Date,
    trx: TransactionClientContract
  ): Promise<OrganizationSubscriptionRow> {
    const current = await this.subscriptions.findCurrentForEntitlements(order.organizationId, trx)

    const periodStart = toJsDate(order.periodStart)
    const periodEnd = toJsDate(order.periodEnd)
    const patch = {
      planId: order.planId,
      gateway: GATEWAY,
      status: 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      lastPaymentStatus: 'captured',
      lastPaymentAt: paidAt,
      activatedAt: current?.activatedAt ?? paidAt,
      checkoutUrl: null,
      graceEndsAt: null,
      endedAt: null,
      cancelledAt: null,
      cancelAtPeriodEnd: false,
      metadata: {
        ...(typeof current?.metadata === 'object' && current.metadata ? current.metadata : {}),
        planCode: snapshot.code,
        checkoutPending: false,
      },
    }

    if (current) {
      const updated = await this.subscriptions.updateById(
        {
          organizationId: order.organizationId,
          subscriptionId: current.id,
          patch,
        },
        trx
      )
      if (updated) return updated
    }

    return this.subscriptions.insert(
      {
        organizationId: order.organizationId,
        planId: order.planId,
        gateway: GATEWAY,
        status: 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        activatedAt: paidAt,
        lastPaymentStatus: 'captured',
        lastPaymentAt: paidAt,
        metadata: { planCode: snapshot.code, checkoutPending: false },
      },
      trx
    )
  }

  async #issuePaidInvoice(params: {
    order: BillingOrderRow
    snapshot: BillingPlanSnapshot
    subscriptionId: string
    paymentTransactionId: string
    paymentMethod: string | null
    paidAt: Date
    trx: TransactionClientContract
  }) {
    const org = await params.trx
      .from('organizations')
      .where('id', params.order.organizationId)
      .whereNull('deletedAt')
      .select('id', 'name', 'email', 'phone', 'address', 'gstin')
      .first()

    const amount = toNumber(params.order.total)
    const totals = computeInvoiceTotals({
      lineItems: [{ amount }],
      taxRate: 0,
      discount: 0,
    })
    const issueDate = DateTime.fromJSDate(params.paidAt).toUTC()
    const year = issueDate.year

    await params.trx.rawQuery('SELECT pg_advisory_xact_lock(?, ?)', [INVOICE_NUMBER_LOCK_NS, year])
    const maxSeq = await this.invoices.findMaxSequenceForYear(year, params.trx)
    const invoiceNumber = formatInvoiceNumber(year, maxSeq + 1)

    const invoice = await this.invoices.insert(
      {
        organizationId: params.order.organizationId,
        subscriptionId: params.subscriptionId,
        planId: params.order.planId,
        paymentTransactionId: params.paymentTransactionId,
        invoiceNumber,
        status: 'paid',
        billingPeriod: billingPeriodFromSnapshot(params.snapshot),
        planName: params.snapshot.name,
        periodStart: toJsDate(params.order.periodStart),
        periodEnd: toJsDate(params.order.periodEnd),
        issueDate: issueDate.toJSDate(),
        dueDate: issueDate.toJSDate(),
        currency: params.order.currency,
        subtotal: totals.subtotal,
        taxRate: totals.taxRate,
        tax: totals.tax,
        discount: totals.discount,
        total: totals.total,
        paymentMethod: params.paymentMethod,
        billToName: (org?.name as string | undefined)?.trim() || 'Organization',
        billToEmail: (org?.email as string | undefined)?.trim() || 'billing@example.com',
        billToPhone: (org?.phone as string | undefined)?.trim() || null,
        billToAddress: formatOrganizationAddress(org?.address, org?.country) || null,
        billToGstin: (org?.gstin as string | undefined)?.trim() || null,
        paidAt: params.paidAt,
        metadata: { billingOrderId: params.order.id },
      },
      params.trx
    )

    await this.invoices.insertLineItems(
      [
        {
          invoiceId: invoice.id,
          organizationId: params.order.organizationId,
          sortOrder: 0,
          description: params.snapshot.name,
          detail: `${params.snapshot.code} · ${billingPeriodFromSnapshot(params.snapshot)}`,
          quantity: 1,
          unitPrice: amount,
          amount,
        },
      ],
      params.trx
    )

    await insertAuthorizationAudit(
      {
        organizationId: params.order.organizationId,
        actorUserId: null,
        targetType: 'invoice',
        targetId: invoice.id,
        eventType: 'invoice.created',
        after: { invoiceNumber, status: 'paid', billingOrderId: params.order.id },
      },
      params.trx
    )

    return invoice
  }
}
