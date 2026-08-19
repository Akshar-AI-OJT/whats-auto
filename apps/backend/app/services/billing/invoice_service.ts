import InvoiceException from '#exceptions/invoice_exception'
import { insertAuthorizationAudit } from '#lib/authorization_audit'
import {
  InvoiceRepository,
  type InsertInvoiceLineItemParams,
  type ListInvoicesFilter,
} from '#repositories/invoice_repository'
import { runWithTenant } from '#services/tenant_context'
import {
  buildInvoiceSummary,
  computeInvoiceTotals,
  formatInvoiceNumber,
  transformInvoice,
} from '#transformers/invoice_transformer'
import type { InvoiceStatus, SuperAdminInvoice, SuperAdminInvoiceSummary } from '#types/invoices'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

function toDateTime(date: DateTime | Date): DateTime {
  return date instanceof Date ? DateTime.fromJSDate(date) : date
}

function toJsDate(date: DateTime | Date | string): Date {
  if (date instanceof Date) return date
  if (typeof date === 'string') return new Date(date)
  return date.toJSDate()
}

export type CreateInvoiceInput = {
  organizationId: string
  subscriptionId?: string
  planId?: string
  organizationName: string
  organizationEmail: string
  organizationPhone?: string
  organizationAddress?: string
  organizationGstin?: string
  planName: string
  billingPeriod: 'monthly' | 'yearly' | 'custom'
  periodStart: DateTime | Date
  periodEnd: DateTime | Date
  issueDate: DateTime | Date
  dueDate: DateTime | Date
  currency?: string
  taxRate?: number
  discount?: number
  notes?: string
  lineItems: Array<{
    description: string
    detail?: string
    quantity: number
    unitPrice: number
    amount: number
  }>
}

export class InvoiceService {
  constructor(private readonly invoices = new InvoiceRepository()) {}

  async listInvoicesPaginated(params: {
    page: number
    perPage: number
    filters?: ListInvoicesFilter
  }) {
    const paginator = await this.invoices.listPaginated(params)
    const invoiceRows = paginator.all()
    const ids = invoiceRows.map((row) => row.id)
    const lineItems = await this.invoices.listLineItemsForInvoices(ids)
    const lineItemsByInvoice = groupLineItems(lineItems)

    const data = invoiceRows.map((row) =>
      transformInvoice(row, lineItemsByInvoice.get(row.id) ?? [])
    )

    return {
      data,
      meta: paginator.getMeta(),
    }
  }

  async getInvoiceSummary(filters: ListInvoicesFilter = {}): Promise<SuperAdminInvoiceSummary> {
    const rows = await this.invoices.listForSummary(filters)
    return buildInvoiceSummary(rows)
  }

  async getInvoiceById(invoiceId: string): Promise<SuperAdminInvoice> {
    const invoice = await this.invoices.findById(invoiceId)
    if (!invoice) {
      throw InvoiceException.notFound()
    }

    const lineItems = await this.invoices.listLineItemsForInvoice(invoiceId)
    const gatewayPaymentId = await this.#resolveGatewayPaymentId(invoice.paymentTransactionId)

    return transformInvoice(invoice, lineItems, { gatewayPaymentId })
  }

  async createInvoice(
    data: CreateInvoiceInput,
    actorUserId?: string | null
  ): Promise<SuperAdminInvoice> {
    if (!data.lineItems.length) {
      throw InvoiceException.invalidLineItems()
    }

    const periodStart = toDateTime(data.periodStart)
    const periodEnd = toDateTime(data.periodEnd)
    const issueDate = toDateTime(data.issueDate)
    const dueDate = toDateTime(data.dueDate)

    if (periodEnd <= periodStart) {
      throw InvoiceException.invalidPeriod()
    }

    if (dueDate < issueDate) {
      throw InvoiceException.invalidDueDate()
    }

    const organization = await db
      .from('organizations')
      .where('id', data.organizationId)
      .whereNull('deletedAt')
      .select('id', 'currency')
      .first()

    if (!organization) {
      throw InvoiceException.organizationNotFound()
    }

    if (data.planId) {
      const plan = await db.from('plans').where('id', data.planId).select('id').first()
      if (!plan) {
        throw InvoiceException.planNotFound()
      }
    }

    if (data.subscriptionId) {
      const subscription = await db
        .from('organization_subscriptions')
        .where('id', data.subscriptionId)
        .where('organizationId', data.organizationId)
        .select('id')
        .first()

      if (!subscription) {
        throw InvoiceException.subscriptionNotFound()
      }
    }

    const totals = computeInvoiceTotals({
      lineItems: data.lineItems,
      taxRate: data.taxRate,
      discount: data.discount,
    })

    const issueYear = issueDate.year
    const invoiceNumber = await this.#nextInvoiceNumber(issueYear)

    return runWithTenant(data.organizationId, async () => {
      return db.transaction(async (trx) => {
        const invoice = await this.invoices.insert(
          {
            organizationId: data.organizationId,
            subscriptionId: data.subscriptionId ?? null,
            planId: data.planId ?? null,
            invoiceNumber,
            status: 'pending',
            billingPeriod: data.billingPeriod,
            planName: data.planName,
            periodStart: periodStart.toJSDate(),
            periodEnd: periodEnd.toJSDate(),
            issueDate: issueDate.toJSDate(),
            dueDate: dueDate.toJSDate(),
            currency: (data.currency ?? organization.currency ?? 'USD').toUpperCase(),
            subtotal: totals.subtotal,
            taxRate: totals.taxRate,
            tax: totals.tax,
            discount: totals.discount,
            total: totals.total,
            notes: data.notes?.trim() || null,
            billToName: data.organizationName.trim(),
            billToEmail: data.organizationEmail.trim(),
            billToPhone: data.organizationPhone?.trim() || null,
            billToAddress: data.organizationAddress?.trim() || null,
            billToGstin: data.organizationGstin?.trim() || null,
          },
          trx
        )

        const lineItemRows = await this.invoices.insertLineItems(
          data.lineItems.map((item, index): InsertInvoiceLineItemParams => ({
            invoiceId: invoice.id,
            organizationId: data.organizationId,
            sortOrder: index,
            description: item.description.trim(),
            detail: item.detail?.trim() || null,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.amount,
          })),
          trx
        )

        await insertAuthorizationAudit(
          {
            organizationId: data.organizationId,
            actorUserId: actorUserId ?? null,
            targetType: 'invoice',
            targetId: invoice.id,
            eventType: 'invoice.created',
            after: { invoiceNumber, status: invoice.status },
          },
          trx
        )

        return transformInvoice(invoice, lineItemRows)
      })
    })
  }

  async markInvoicePaid(
    invoiceId: string,
    input: { paymentMethod?: string; paymentTransactionId?: string },
    actorUserId?: string | null
  ): Promise<SuperAdminInvoice> {
    const existing = await this.invoices.findById(invoiceId)
    if (!existing) {
      throw InvoiceException.notFound()
    }

    if (existing.status === 'cancelled') {
      throw InvoiceException.cannotMarkCancelledPaid()
    }

    if (input.paymentTransactionId) {
      const payment = await db
        .from('payment_transactions')
        .where('id', input.paymentTransactionId)
        .where('organizationId', existing.organizationId)
        .select('id')
        .first()

      if (!payment) {
        throw InvoiceException.paymentTransactionNotFound()
      }
    }

    const paidAt = DateTime.utc().toJSDate()

    return runWithTenant(existing.organizationId, async () => {
      const updated = await this.invoices.updateById(invoiceId, {
        status: 'paid',
        paymentMethod: input.paymentMethod?.trim() || 'Manual',
        paymentTransactionId: input.paymentTransactionId ?? existing.paymentTransactionId,
        paidAt,
      })

      if (!updated) {
        throw InvoiceException.notFound()
      }

      const lineItems = await this.invoices.listLineItemsForInvoice(invoiceId)
      const gatewayPaymentId = await this.#resolveGatewayPaymentId(updated.paymentTransactionId)

      await insertAuthorizationAudit({
        organizationId: existing.organizationId,
        actorUserId: actorUserId ?? null,
        targetType: 'invoice',
        targetId: updated.id,
        eventType: 'invoice.marked_paid',
        after: { invoiceNumber: updated.invoiceNumber, status: updated.status },
      })

      return transformInvoice(updated, lineItems, { gatewayPaymentId })
    })
  }

  async regenerateInvoice(
    invoiceId: string,
    input: { issueDate?: DateTime | Date; dueDate?: DateTime | Date } = {},
    actorUserId?: string | null
  ): Promise<SuperAdminInvoice> {
    const existing = await this.invoices.findById(invoiceId)
    if (!existing) {
      throw InvoiceException.notFound()
    }

    const lineItems = await this.invoices.listLineItemsForInvoice(invoiceId)
    const issueDate = input.issueDate ? toDateTime(input.issueDate) : DateTime.utc()
    const dueDate = input.dueDate ? toDateTime(input.dueDate) : issueDate.plus({ days: 30 })

    if (dueDate < issueDate) {
      throw InvoiceException.invalidDueDate()
    }

    const invoiceNumber = await this.#nextInvoiceNumber(issueDate.year)
    const status: InvoiceStatus =
      existing.status === 'cancelled' ? 'pending' : (existing.status as InvoiceStatus)

    return runWithTenant(existing.organizationId, async () => {
      return db.transaction(async (trx) => {
        const invoice = await this.invoices.insert(
          {
            organizationId: existing.organizationId,
            subscriptionId: existing.subscriptionId,
            planId: existing.planId,
            sourceInvoiceId: existing.id,
            invoiceNumber,
            status,
            billingPeriod: existing.billingPeriod as CreateInvoiceInput['billingPeriod'],
            planName: existing.planName,
            periodStart: toJsDate(existing.periodStart),
            periodEnd: toJsDate(existing.periodEnd),
            issueDate: issueDate.toJSDate(),
            dueDate: dueDate.toJSDate(),
            currency: existing.currency,
            subtotal: Number(existing.subtotal),
            taxRate: Number(existing.taxRate),
            tax: Number(existing.tax),
            discount: Number(existing.discount),
            total: Number(existing.total),
            notes: existing.notes,
            billToName: existing.billToName,
            billToEmail: existing.billToEmail,
            billToPhone: existing.billToPhone,
            billToAddress: existing.billToAddress,
            billToGstin: existing.billToGstin,
            metadata: existing.metadata ?? {},
          },
          trx
        )

        const copiedLineItems = await this.invoices.insertLineItems(
          lineItems.map((item, index): InsertInvoiceLineItemParams => ({
            invoiceId: invoice.id,
            organizationId: existing.organizationId,
            sortOrder: index,
            description: item.description,
            detail: item.detail,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            amount: Number(item.amount),
          })),
          trx
        )

        await insertAuthorizationAudit(
          {
            organizationId: existing.organizationId,
            actorUserId: actorUserId ?? null,
            targetType: 'invoice',
            targetId: invoice.id,
            eventType: 'invoice.created',
            after: { invoiceNumber, status: invoice.status, sourceInvoiceId: existing.id },
          },
          trx
        )

        return transformInvoice(invoice, copiedLineItems)
      })
    })
  }

  sendInvoiceUnavailable() {
    throw InvoiceException.actionUnavailable('Invoice email delivery is not available yet')
  }

  downloadInvoiceUnavailable() {
    throw InvoiceException.actionUnavailable('Invoice PDF download is not available yet')
  }

  async #nextInvoiceNumber(year: number) {
    const maxSeq = await this.invoices.findMaxSequenceForYear(year)
    return formatInvoiceNumber(year, maxSeq + 1)
  }

  async #resolveGatewayPaymentId(paymentTransactionId: string | null) {
    if (!paymentTransactionId) return null

    const payment = await db
      .from('payment_transactions')
      .where('id', paymentTransactionId)
      .select('gatewayPaymentId')
      .first()

    return (payment as { gatewayPaymentId?: string | null } | undefined)?.gatewayPaymentId ?? null
  }
}

function groupLineItems(items: Awaited<ReturnType<InvoiceRepository['listLineItemsForInvoices']>>) {
  const map = new Map<string, typeof items>()
  for (const item of items) {
    const bucket = map.get(item.invoiceId) ?? []
    bucket.push(item)
    map.set(item.invoiceId, bucket)
  }
  return map
}
