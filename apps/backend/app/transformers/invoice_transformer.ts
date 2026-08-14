import type { InvoiceLineItemRow, InvoiceRow } from '#repositories/invoice_repository'
import type {
  InvoiceBillingPeriod,
  InvoiceStatus,
  SuperAdminInvoice,
  SuperAdminInvoiceLineItem,
  SuperAdminInvoiceSummary,
} from '#types/invoices'

function toNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number(value)
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toDateOnly(value: Date | string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }
  const date = value instanceof Date ? value : new Date(value)
  return date.toISOString().slice(0, 10)
}

export function resolveEffectiveInvoiceStatus(
  row: Pick<InvoiceRow, 'status' | 'dueDate'>,
  now: Date = new Date()
): InvoiceStatus {
  if (row.status === 'pending') {
    const due = toDateOnly(row.dueDate)
    const today = now.toISOString().slice(0, 10)
    if (due < today) {
      return 'overdue'
    }
  }

  return row.status as InvoiceStatus
}

export function transformInvoiceLineItem(row: InvoiceLineItemRow): SuperAdminInvoiceLineItem {
  return {
    id: row.id,
    description: row.description,
    detail: row.detail,
    quantity: toNumber(row.quantity),
    unitPrice: toNumber(row.unitPrice),
    amount: toNumber(row.amount),
  }
}

export function transformInvoice(
  row: InvoiceRow,
  lineItems: InvoiceLineItemRow[],
  options?: { gatewayPaymentId?: string | null; now?: Date }
): SuperAdminInvoice {
  const status = resolveEffectiveInvoiceStatus(row, options?.now)

  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    organization: {
      id: row.organizationId,
      name: row.billToName,
      email: row.billToEmail,
      phone: row.billToPhone,
      address: row.billToAddress,
      gstin: row.billToGstin,
    },
    planName: row.planName,
    billingPeriod: row.billingPeriod as InvoiceBillingPeriod,
    periodStart: toIso(row.periodStart),
    periodEnd: toIso(row.periodEnd),
    status,
    issueDate: toDateOnly(row.issueDate),
    dueDate: toDateOnly(row.dueDate),
    currency: row.currency,
    lineItems: lineItems.map(transformInvoiceLineItem),
    subtotal: toNumber(row.subtotal),
    tax: toNumber(row.tax),
    taxRate: toNumber(row.taxRate),
    discount: toNumber(row.discount),
    total: toNumber(row.total),
    notes: row.notes,
    paymentMethod: row.paymentMethod,
    transactionId: options?.gatewayPaymentId ?? row.paymentTransactionId,
    paymentDate: row.paidAt ? toDateOnly(row.paidAt) : null,
    organizationId: row.organizationId,
    subscriptionId: row.subscriptionId,
    planId: row.planId,
    paymentTransactionId: row.paymentTransactionId,
    sourceInvoiceId: row.sourceInvoiceId,
    createdAt: toIso(row.createdAt),
    updatedAt: row.updatedAt ? toIso(row.updatedAt) : null,
  }
}

export function buildInvoiceSummary(
  rows: InvoiceRow[],
  now: Date = new Date()
): SuperAdminInvoiceSummary {
  const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const summary: SuperAdminInvoiceSummary = {
    totalCount: rows.length,
    paidCount: 0,
    paidAmount: 0,
    pendingCount: 0,
    pendingAmount: 0,
    overdueCount: 0,
    overdueAmount: 0,
    cancelledCount: 0,
    cancelledAmount: 0,
    thisMonthCount: 0,
    thisMonthAmount: 0,
  }

  for (const row of rows) {
    const status = resolveEffectiveInvoiceStatus(row, now)
    const total = toNumber(row.total)

    if (status === 'paid') {
      summary.paidCount += 1
      summary.paidAmount += total
    } else if (status === 'pending') {
      summary.pendingCount += 1
      summary.pendingAmount += total
    } else if (status === 'overdue') {
      summary.overdueCount += 1
      summary.overdueAmount += total
    } else if (status === 'cancelled') {
      summary.cancelledCount += 1
      summary.cancelledAmount += total
    }

    if (toDateOnly(row.issueDate).startsWith(thisMonthPrefix)) {
      summary.thisMonthCount += 1
      summary.thisMonthAmount += total
    }
  }

  return summary
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export function computeInvoiceTotals(input: {
  lineItems: Array<{ amount: number }>
  taxRate?: number
  discount?: number
}) {
  const subtotal = roundMoney(input.lineItems.reduce((sum, item) => sum + item.amount, 0))
  const discount = roundMoney(Math.max(0, input.discount ?? 0))
  const taxable = Math.max(0, subtotal - discount)
  const taxRate = input.taxRate ?? 0.18
  const tax = roundMoney(taxable * taxRate)
  const total = roundMoney(taxable + tax)

  return { subtotal, discount, taxRate, tax, total }
}

export function formatInvoiceNumber(year: number, sequence: number) {
  return `INV-${year}-${String(sequence).padStart(6, '0')}`
}
