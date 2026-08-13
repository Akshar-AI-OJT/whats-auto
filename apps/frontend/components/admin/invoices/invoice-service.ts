/**
 * Invoice data-access layer (mock-backed).
 *
 * Swap the bodies of these functions to real `api.superAdmin.invoices.*` calls later
 * without rewriting the Invoices UI.
 */

import { MOCK_INVOICES_SEED, MOCK_INVOICE_ORGANIZATIONS, PLATFORM_BILLING_PROFILE } from './mock-invoices'
import type {
  CreateInvoiceInput,
  Invoice,
  InvoiceActionResult,
  InvoiceBillingPeriod,
  InvoiceListResult,
  InvoiceOrganization,
  InvoiceStatus,
  InvoiceSummary,
  ListInvoicesParams,
  PlatformBillingProfile,
} from './types'

const LATENCY_MS = 180

/** Mutable in-memory store. Reset only for tests if needed. */
let store: Invoice[] = structuredClone(MOCK_INVOICES_SEED)
let sequence = 513

function delay(ms = LATENCY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cloneInvoice(invoice: Invoice): Invoice {
  return structuredClone(invoice)
}

function matchesSearch(invoice: Invoice, search: string) {
  const q = search.trim().toLowerCase()
  if (!q) return true
  return (
    invoice.invoiceNumber.toLowerCase().includes(q) ||
    invoice.organization.name.toLowerCase().includes(q) ||
    invoice.organization.email.toLowerCase().includes(q) ||
    invoice.planName.toLowerCase().includes(q)
  )
}

function applyFilters(params: ListInvoicesParams): Invoice[] {
  const status = params.status ?? 'all'
  const issueMonth = params.issueMonth ?? 'all'
  const billingPeriod = params.billingPeriod ?? 'all'
  const search = params.search ?? ''

  return store
    .filter((invoice) => {
      if (status !== 'all' && invoice.status !== status) return false
      if (billingPeriod !== 'all' && invoice.billingPeriod !== billingPeriod) return false
      if (issueMonth !== 'all' && !invoice.issueDate.startsWith(issueMonth)) return false
      if (!matchesSearch(invoice, search)) return false
      return true
    })
    .sort((a, b) => (a.issueDate < b.issueDate ? 1 : a.issueDate > b.issueDate ? -1 : 0))
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function buildTotals(input: CreateInvoiceInput) {
  if (input.lineItems && input.lineItems.length > 0) {
    const subtotal = roundMoney(input.lineItems.reduce((sum, item) => sum + item.amount, 0))
    const discount = roundMoney(Math.max(0, input.discount ?? 0))
    const taxable = Math.max(0, subtotal - discount)
    const taxRate = input.taxRate ?? 0.18
    const tax = roundMoney(taxable * taxRate)
    const total = roundMoney(taxable + tax)
    return { subtotal, discount, taxRate, tax, total, extra: 0 }
  }

  const extra = input.extraLineAmount && input.extraLineAmount > 0 ? input.extraLineAmount : 0
  const subtotal = roundMoney(input.amount + extra)
  const discount = roundMoney(Math.max(0, input.discount ?? 0))
  const taxable = Math.max(0, subtotal - discount)
  const taxRate = input.taxRate ?? 0.18
  const tax = roundMoney(taxable * taxRate)
  const total = roundMoney(taxable + tax)
  return { subtotal, discount, taxRate, tax, total, extra }
}

export function getPlatformBillingProfile(): PlatformBillingProfile {
  return PLATFORM_BILLING_PROFILE
}

export function listMockOrganizations(): InvoiceOrganization[] {
  return structuredClone(MOCK_INVOICE_ORGANIZATIONS)
}

export async function listInvoices(params: ListInvoicesParams = {}): Promise<InvoiceListResult> {
  await delay()
  const perPage = Math.max(1, params.perPage ?? 10)
  const page = Math.max(1, params.page ?? 1)
  const filtered = applyFilters(params)
  const total = filtered.length
  const lastPage = Math.max(1, Math.ceil(total / perPage))
  const safePage = Math.min(page, lastPage)
  const start = (safePage - 1) * perPage
  const items = filtered.slice(start, start + perPage).map(cloneInvoice)
  return { items, total, page: safePage, perPage, lastPage }
}

export async function getInvoiceSummary(params: Omit<ListInvoicesParams, 'page' | 'perPage'> = {}): Promise<InvoiceSummary> {
  await delay(80)
  const filtered = applyFilters(params)
  const now = new Date()
  const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const summary: InvoiceSummary = {
    totalCount: filtered.length,
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

  for (const invoice of filtered) {
    if (invoice.status === 'paid') {
      summary.paidCount += 1
      summary.paidAmount += invoice.total
    } else if (invoice.status === 'pending') {
      summary.pendingCount += 1
      summary.pendingAmount += invoice.total
    } else if (invoice.status === 'overdue') {
      summary.overdueCount += 1
      summary.overdueAmount += invoice.total
    } else if (invoice.status === 'cancelled') {
      summary.cancelledCount += 1
      summary.cancelledAmount += invoice.total
    }

    if (invoice.issueDate.startsWith(thisMonthPrefix)) {
      summary.thisMonthCount += 1
      summary.thisMonthAmount += invoice.total
    }
  }

  return summary
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  await delay()
  const found = store.find((invoice) => invoice.id === id)
  return found ? cloneInvoice(found) : null
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  await delay(220)
  const { subtotal, discount, taxRate, tax, total, extra } = buildTotals(input)
  const now = new Date().toISOString()
  const invoiceNumber = `INV-2026-${String(sequence++).padStart(6, '0')}`

  const lineItems: Invoice['lineItems'] =
    input.lineItems && input.lineItems.length > 0
      ? input.lineItems.map((item, index) => ({
          id: `li_${sequence}_${index}`,
          description: item.description,
          detail: item.detail,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.amount,
        }))
      : [
          {
            id: `li_${sequence}_a`,
            description: `${input.planName} Plan (${
              input.billingPeriod === 'monthly'
                ? 'Monthly Subscription'
                : input.billingPeriod === 'yearly'
                  ? 'Yearly Subscription'
                  : 'Custom Subscription'
            })`,
            detail: 'Includes plan features for the selected billing period',
            quantity: 1,
            unitPrice: input.amount,
            amount: input.amount,
          },
          ...(extra > 0
            ? [
                {
                  id: `li_${sequence}_b`,
                  description: input.extraLineDescription?.trim() || 'Additional usage',
                  quantity: 1,
                  unitPrice: extra,
                  amount: extra,
                },
              ]
            : []),
        ]

  const invoice: Invoice = {
    id: `inv_${crypto.randomUUID().slice(0, 8)}`,
    invoiceNumber,
    organization: {
      id: input.organizationId,
      name: input.organizationName,
      email: input.organizationEmail,
      phone: input.organizationPhone,
      address: input.organizationAddress,
      gstin: input.organizationGstin,
    },
    planName: input.planName,
    billingPeriod: input.billingPeriod,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    status: 'pending',
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    currency: 'USD',
    lineItems,
    subtotal,
    discount,
    taxRate,
    tax,
    total,
    notes: input.notes?.trim() || undefined,
    paymentMethod: null,
    transactionId: null,
    paymentDate: null,
    createdAt: now,
    updatedAt: now,
  }

  store = [invoice, ...store]
  return cloneInvoice(invoice)
}

export async function markInvoicePaid(id: string): Promise<InvoiceActionResult> {
  await delay()
  const index = store.findIndex((invoice) => invoice.id === id)
  if (index < 0) return { ok: false, reason: 'not_found', messageKey: 'errors.notFound' }

  const current = store[index]
  if (current.status === 'cancelled') {
    return { ok: false, reason: 'invalid', messageKey: 'errors.cannotMarkCancelledPaid' }
  }

  const now = new Date()
  const updated: Invoice = {
    ...current,
    status: 'paid',
    paymentMethod: current.paymentMethod ?? 'Manual',
    transactionId: current.transactionId ?? `txn_mock_${now.getTime()}`,
    paymentDate: now.toISOString().slice(0, 10),
    updatedAt: now.toISOString(),
  }
  store[index] = updated
  return { ok: true, invoice: cloneInvoice(updated), messageKey: 'toast.markedPaid' }
}

export async function sendInvoice(_id: string): Promise<InvoiceActionResult> {
  await delay(100)
  // No email/send API yet — keep UI wired without inventing HTTP.
  return { ok: false, reason: 'unavailable', messageKey: 'actions.sendSoon' }
}

export async function downloadInvoice(_id: string): Promise<InvoiceActionResult> {
  await delay(80)
  return { ok: false, reason: 'unavailable', messageKey: 'actions.downloadSoon' }
}

export async function regenerateInvoice(id: string): Promise<InvoiceActionResult> {
  await delay()
  const index = store.findIndex((invoice) => invoice.id === id)
  if (index < 0) return { ok: false, reason: 'not_found', messageKey: 'errors.notFound' }

  const current = store[index]
  const now = new Date().toISOString()
  const updated: Invoice = {
    ...cloneInvoice(current),
    id: `inv_${crypto.randomUUID().slice(0, 8)}`,
    invoiceNumber: `INV-2026-${String(sequence++).padStart(6, '0')}`,
    status: current.status === 'cancelled' ? 'pending' : current.status,
    updatedAt: now,
    createdAt: now,
  }
  store = [updated, ...store]
  return { ok: true, invoice: cloneInvoice(updated), messageKey: 'toast.regenerated' }
}

/** Test helper — not used by UI. */
export function __resetInvoiceStoreForTests() {
  store = structuredClone(MOCK_INVOICES_SEED)
  sequence = 513
}

export type { InvoiceStatus, InvoiceBillingPeriod }
