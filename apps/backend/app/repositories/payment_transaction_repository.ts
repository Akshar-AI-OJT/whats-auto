import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export type PaymentTransactionRow = {
  id: string
  organizationId: string
  subscriptionId: string | null
  gateway: string
  gatewayOrderId: string | null
  gatewayPaymentId: string | null
  gatewayInvoiceId: string | null
  amount: string | number
  currency: string
  status: string
  paymentMethod: string | null
  receiptNumber: string | null
  invoiceUrl: string | null
  failureCode: string | null
  failureReason: string | null
  refundedAmount: string | number
  paidAt: Date | string | null
  metadata: Record<string, unknown>
  createdAt: Date | string
  updatedAt: Date | string | null
}

export type UpsertPaymentByGatewayPaymentIdParams = {
  organizationId: string
  subscriptionId?: string | null
  gateway: string
  gatewayPaymentId: string
  gatewayOrderId?: string | null
  gatewayInvoiceId?: string | null
  amount: number
  currency: string
  status: string
  paymentMethod?: string | null
  failureCode?: string | null
  failureReason?: string | null
  paidAt?: Date | null
  metadata?: Record<string, unknown>
}

type Db = typeof db | TransactionClientContract

/**
 * Tenant-scoped payment_transactions access.
 */
export class PaymentTransactionRepository {
  async findByGatewayPaymentId(
    params: { gateway: string; gatewayPaymentId: string },
    client: Db = db
  ): Promise<PaymentTransactionRow | null> {
    const row = await client
      .from('payment_transactions')
      .where('gateway', params.gateway)
      .where('gatewayPaymentId', params.gatewayPaymentId)
      .first()
    return (row as PaymentTransactionRow | undefined) ?? null
  }

  /**
   * Insert or update by (gateway, gatewayPaymentId). Call under runWithTenant.
   */
  async upsertByGatewayPaymentId(
    params: UpsertPaymentByGatewayPaymentIdParams,
    client: Db = db
  ): Promise<PaymentTransactionRow> {
    const existing = await this.findByGatewayPaymentId(
      { gateway: params.gateway, gatewayPaymentId: params.gatewayPaymentId },
      client
    )

    if (existing) {
      const [updated] = await client
        .from('payment_transactions')
        .where('id', existing.id)
        .update({
          subscriptionId: params.subscriptionId ?? existing.subscriptionId,
          gatewayOrderId: params.gatewayOrderId ?? existing.gatewayOrderId,
          gatewayInvoiceId: params.gatewayInvoiceId ?? existing.gatewayInvoiceId,
          amount: params.amount,
          currency: params.currency,
          status: params.status,
          paymentMethod: params.paymentMethod ?? existing.paymentMethod,
          failureCode: params.failureCode ?? existing.failureCode,
          failureReason: params.failureReason ?? existing.failureReason,
          paidAt: params.paidAt ?? existing.paidAt,
          metadata: params.metadata ?? existing.metadata ?? {},
        })
        .returning('*')
      return updated as PaymentTransactionRow
    }

    const [created] = await client
      .table('payment_transactions')
      .insert({
        organizationId: params.organizationId,
        subscriptionId: params.subscriptionId ?? null,
        gateway: params.gateway,
        gatewayPaymentId: params.gatewayPaymentId,
        gatewayOrderId: params.gatewayOrderId ?? null,
        gatewayInvoiceId: params.gatewayInvoiceId ?? null,
        amount: params.amount,
        currency: params.currency,
        status: params.status,
        paymentMethod: params.paymentMethod ?? null,
        failureCode: params.failureCode ?? null,
        failureReason: params.failureReason ?? null,
        refundedAmount: 0,
        paidAt: params.paidAt ?? null,
        metadata: params.metadata ?? {},
      })
      .returning('*')

    return created as PaymentTransactionRow
  }
}
