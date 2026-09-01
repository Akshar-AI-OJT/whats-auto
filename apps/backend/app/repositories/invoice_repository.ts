import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { InvoiceBillingPeriod, InvoiceStatus } from '#types/invoices'

export type InvoiceRow = {
  id: string
  organizationId: string
  subscriptionId: string | null
  planId: string | null
  paymentTransactionId: string | null
  sourceInvoiceId: string | null
  invoiceNumber: string
  status: string
  billingPeriod: string
  planName: string
  periodStart: Date | string
  periodEnd: Date | string
  issueDate: Date | string
  dueDate: Date | string
  currency: string
  subtotal: string | number
  taxRate: string | number
  tax: string | number
  discount: string | number
  total: string | number
  notes: string | null
  paymentMethod: string | null
  billToName: string
  billToEmail: string
  billToPhone: string | null
  billToAddress: string | null
  billToGstin: string | null
  metadata: Record<string, unknown>
  paidAt: Date | string | null
  cancelledAt: Date | string | null
  createdAt: Date | string
  updatedAt: Date | string | null
}

export type InvoiceLineItemRow = {
  id: string
  invoiceId: string
  organizationId: string
  sortOrder: number
  description: string
  detail: string | null
  quantity: string | number
  unitPrice: string | number
  amount: string | number
  createdAt: Date | string
}

export type InsertInvoiceParams = {
  organizationId: string
  subscriptionId?: string | null
  planId?: string | null
  paymentTransactionId?: string | null
  sourceInvoiceId?: string | null
  invoiceNumber: string
  status: InvoiceStatus
  billingPeriod: InvoiceBillingPeriod
  planName: string
  periodStart: Date
  periodEnd: Date
  issueDate: Date
  dueDate: Date
  currency: string
  subtotal: number
  taxRate: number
  tax: number
  discount: number
  total: number
  notes?: string | null
  paymentMethod?: string | null
  billToName: string
  billToEmail: string
  billToPhone?: string | null
  billToAddress?: string | null
  billToGstin?: string | null
  metadata?: Record<string, unknown>
  paidAt?: Date | null
}

export type InsertInvoiceLineItemParams = {
  invoiceId: string
  organizationId: string
  sortOrder: number
  description: string
  detail?: string | null
  quantity: number
  unitPrice: number
  amount: number
}

export type ListInvoicesFilter = {
  search?: string
  status?: InvoiceStatus | 'all'
  issueMonth?: string
  billingPeriod?: InvoiceBillingPeriod | 'all'
}

type Db = typeof db | TransactionClientContract

function applyInvoiceFilters(query: ReturnType<typeof db.from>, filters: ListInvoicesFilter) {
  const search = filters.search?.trim()
  if (search) {
    const pattern = `%${search.replace(/[%_\\]/g, '\\$&')}%`
    query.where((builder) => {
      builder
        .whereILike('invoiceNumber', pattern)
        .orWhereILike('billToName', pattern)
        .orWhereILike('billToEmail', pattern)
        .orWhereILike('planName', pattern)
    })
  }

  if (filters.status && filters.status !== 'all') {
    if (filters.status === 'overdue') {
      query.where('status', 'pending').where('dueDate', '<', db.raw('CURRENT_DATE'))
    } else {
      query.where('status', filters.status)
    }
  }

  if (
    filters.issueMonth &&
    filters.issueMonth !== 'all' &&
    /^\d{4}-\d{2}$/.test(filters.issueMonth)
  ) {
    query.whereRaw(`to_char("issueDate", 'YYYY-MM') = ?`, [filters.issueMonth])
  }

  if (filters.billingPeriod && filters.billingPeriod !== 'all') {
    query.where('billingPeriod', filters.billingPeriod)
  }

  return query
}

/**
 * Platform and tenant-scoped invoice access.
 * Super Admin reads use db.from() without tenant context; writes use runWithTenant.
 */
export class InvoiceRepository {
  async findById(invoiceId: string, client: Db = db): Promise<InvoiceRow | null> {
    const row = await client.from('invoices').where('id', invoiceId).first()
    return (row as InvoiceRow | undefined) ?? null
  }

  async listLineItemsForInvoice(invoiceId: string, client: Db = db): Promise<InvoiceLineItemRow[]> {
    const rows = await client
      .from('invoice_line_items')
      .where('invoiceId', invoiceId)
      .orderBy('sortOrder', 'asc')
      .orderBy('createdAt', 'asc')

    return rows as InvoiceLineItemRow[]
  }

  async listLineItemsForInvoices(
    invoiceIds: string[],
    client: Db = db
  ): Promise<InvoiceLineItemRow[]> {
    if (invoiceIds.length === 0) return []

    const rows = await client
      .from('invoice_line_items')
      .whereIn('invoiceId', invoiceIds)
      .orderBy('sortOrder', 'asc')
      .orderBy('createdAt', 'asc')

    return rows as InvoiceLineItemRow[]
  }

  async listPaginated(
    params: { page: number; perPage: number; filters?: ListInvoicesFilter },
    client: Db = db
  ) {
    const query = applyInvoiceFilters(client.from('invoices'), params.filters ?? {})
    return query
      .orderBy('issueDate', 'desc')
      .orderBy('createdAt', 'desc')
      .paginate(params.page, params.perPage)
  }

  async listForSummary(filters: ListInvoicesFilter = {}, client: Db = db): Promise<InvoiceRow[]> {
    const query = applyInvoiceFilters(client.from('invoices'), filters)
    const rows = await query.select('*').orderBy('issueDate', 'desc')
    return rows as InvoiceRow[]
  }

  async findMaxSequenceForYear(year: number, client: Db = db): Promise<number> {
    const prefix = `INV-${year}-`
    const row = await client
      .from('invoices')
      .whereILike('invoiceNumber', `${prefix}%`)
      .select(
        client.raw(`MAX(CAST(SUBSTRING("invoiceNumber" FROM '[0-9]+$') AS INTEGER)) AS "maxSeq"`)
      )
      .first()

    const maxSeq = Number((row as { maxSeq?: string | number | null } | undefined)?.maxSeq ?? 0)
    return Number.isFinite(maxSeq) ? maxSeq : 0
  }

  async insert(params: InsertInvoiceParams, client: Db = db): Promise<InvoiceRow> {
    const [created] = await client
      .table('invoices')
      .insert({
        organizationId: params.organizationId,
        subscriptionId: params.subscriptionId ?? null,
        planId: params.planId ?? null,
        paymentTransactionId: params.paymentTransactionId ?? null,
        sourceInvoiceId: params.sourceInvoiceId ?? null,
        invoiceNumber: params.invoiceNumber,
        status: params.status,
        billingPeriod: params.billingPeriod,
        planName: params.planName,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        issueDate: params.issueDate,
        dueDate: params.dueDate,
        currency: params.currency,
        subtotal: params.subtotal,
        taxRate: params.taxRate,
        tax: params.tax,
        discount: params.discount,
        total: params.total,
        notes: params.notes ?? null,
        paymentMethod: params.paymentMethod ?? null,
        billToName: params.billToName,
        billToEmail: params.billToEmail,
        billToPhone: params.billToPhone ?? null,
        billToAddress: params.billToAddress ?? null,
        billToGstin: params.billToGstin ?? null,
        metadata: params.metadata ?? {},
        paidAt: params.paidAt ?? null,
      })
      .returning('*')

    return created as InvoiceRow
  }

  async insertLineItems(
    items: InsertInvoiceLineItemParams[],
    client: Db = db
  ): Promise<InvoiceLineItemRow[]> {
    if (items.length === 0) return []

    const rows = await client.table('invoice_line_items').insert(items).returning('*')
    return rows as InvoiceLineItemRow[]
  }

  async updateById(
    invoiceId: string,
    patch: Record<string, unknown>,
    client: Db = db
  ): Promise<InvoiceRow | null> {
    const [updated] = await client
      .from('invoices')
      .where('id', invoiceId)
      .update(patch)
      .returning('*')

    return (updated as InvoiceRow | undefined) ?? null
  }
}
