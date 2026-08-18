/**
 * Invoice data-access layer — Super Admin billing APIs.
 */

import { listAllSuperAdminOrganizations } from '@/components/admin/organizations/organization-api'
import {
  api,
  type ApiError,
  type PaginationMeta,
  type SuperAdminInvoice,
} from '@/lib/api'
import { PLATFORM_BILLING_PROFILE } from './mock-invoices'
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

function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as ApiError).status === 'number'
  )
}

function unwrapInvoice(data: unknown): SuperAdminInvoice {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid invoice response')
  }
  const root = data as { data?: SuperAdminInvoice } & SuperAdminInvoice
  if (root.data && typeof root.data === 'object' && 'id' in root.data) {
    return root.data
  }
  if ('id' in root && 'invoiceNumber' in root) {
    return root as SuperAdminInvoice
  }
  throw new Error('Invalid invoice response')
}

function unwrapSummary(data: unknown): InvoiceSummary {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid invoice summary response')
  }
  const root = data as { data?: InvoiceSummary } & InvoiceSummary
  if (root.data && typeof root.data === 'object' && 'totalCount' in root.data) {
    return root.data
  }
  if ('totalCount' in root) {
    return root as InvoiceSummary
  }
  throw new Error('Invalid invoice summary response')
}

function unwrapPaginated(data: unknown): {
  items: SuperAdminInvoice[]
  meta: PaginationMeta | null
} {
  if (!data) return { items: [], meta: null }
  if (Array.isArray(data)) return { items: data, meta: null }

  const root = data as {
    data?: SuperAdminInvoice[] | { data?: SuperAdminInvoice[]; meta?: PaginationMeta }
    meta?: PaginationMeta
  }

  if (Array.isArray(root.data)) {
    return { items: root.data, meta: root.meta ?? null }
  }

  if (root.data && typeof root.data === 'object' && Array.isArray(root.data.data)) {
    return { items: root.data.data, meta: root.data.meta ?? root.meta ?? null }
  }

  return { items: [], meta: null }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mapInvoice(apiInvoice: SuperAdminInvoice): Invoice {
  return {
    id: apiInvoice.id,
    invoiceNumber: apiInvoice.invoiceNumber,
    organization: {
      id: apiInvoice.organization.id,
      name: apiInvoice.organization.name,
      email: apiInvoice.organization.email,
      phone: apiInvoice.organization.phone ?? undefined,
      address: apiInvoice.organization.address ?? undefined,
      gstin: apiInvoice.organization.gstin ?? undefined,
    },
    planName: apiInvoice.planName,
    billingPeriod: apiInvoice.billingPeriod as InvoiceBillingPeriod,
    periodStart: apiInvoice.periodStart,
    periodEnd: apiInvoice.periodEnd,
    status: apiInvoice.status as InvoiceStatus,
    issueDate: apiInvoice.issueDate,
    dueDate: apiInvoice.dueDate,
    currency: apiInvoice.currency || 'USD',
    lineItems: apiInvoice.lineItems.map((item) => ({
      id: item.id,
      description: item.description,
      detail: item.detail ?? undefined,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unitPrice),
      amount: toNumber(item.amount),
    })),
    subtotal: toNumber(apiInvoice.subtotal),
    tax: toNumber(apiInvoice.tax),
    taxRate: toNumber(apiInvoice.taxRate),
    discount: toNumber(apiInvoice.discount),
    total: toNumber(apiInvoice.total),
    notes: apiInvoice.notes ?? undefined,
    paymentMethod: apiInvoice.paymentMethod ?? null,
    transactionId: apiInvoice.transactionId ?? null,
    paymentDate: apiInvoice.paymentDate ?? null,
    createdAt: apiInvoice.createdAt,
    updatedAt: apiInvoice.updatedAt ?? apiInvoice.createdAt,
  }
}

function listQueryParams(params: ListInvoicesParams = {}) {
  return {
    page: params.page,
    perPage: params.perPage,
    search: params.search,
    status: params.status,
    issueMonth: params.issueMonth,
    billingPeriod: params.billingPeriod,
  }
}

function mapActionError(error: unknown): InvoiceActionResult {
  if (isApiError(error)) {
    if (error.code === 'E_INVOICE_NOT_FOUND') {
      return { ok: false, reason: 'not_found', messageKey: 'errors.notFound' }
    }
    if (error.code === 'E_INVOICE_CANNOT_MARK_CANCELLED_PAID') {
      return { ok: false, reason: 'invalid', messageKey: 'errors.cannotMarkCancelledPaid' }
    }
    if (error.status === 501 || error.code === 'E_INVOICE_ACTION_UNAVAILABLE') {
      return { ok: false, reason: 'unavailable', messageKey: 'actions.sendSoon' }
    }
  }
  throw error
}

export function getPlatformBillingProfile(): PlatformBillingProfile {
  return PLATFORM_BILLING_PROFILE
}

/** Organizations for the generate-invoice selector (platform org list API). */
export async function listInvoiceOrganizations(): Promise<InvoiceOrganization[]> {
  const organizations = await listAllSuperAdminOrganizations()
  return organizations
    .filter((org) => org.uiStatus !== 'archived')
    .map((org) => ({
      id: org.id,
      name: org.name,
      email: org.email,
      phone: org.phone ?? undefined,
    }))
}

export async function listInvoices(params: ListInvoicesParams = {}): Promise<InvoiceListResult> {
  const perPage = Math.max(1, params.perPage ?? 10)
  const page = Math.max(1, params.page ?? 1)
  const { data } = await api.superAdmin.invoices.list({ ...listQueryParams(params), page, perPage })
  const { items, meta } = unwrapPaginated(data)

  return {
    items: items.map(mapInvoice),
    total: meta?.total ?? items.length,
    page: meta?.currentPage ?? page,
    perPage: meta?.perPage ?? perPage,
    lastPage: meta?.lastPage ?? 1,
  }
}

export async function getInvoiceSummary(
  params: Omit<ListInvoicesParams, 'page' | 'perPage'> = {}
): Promise<InvoiceSummary> {
  const { data } = await api.superAdmin.invoices.summary(listQueryParams(params))
  return unwrapSummary(data)
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  try {
    const { data } = await api.superAdmin.invoices.get(id)
    return mapInvoice(unwrapInvoice(data))
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      return null
    }
    throw error
  }
}

function toCreateBody(input: CreateInvoiceInput) {
  return {
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    organizationEmail: input.organizationEmail,
    organizationPhone: input.organizationPhone,
    organizationAddress: input.organizationAddress,
    organizationGstin: input.organizationGstin,
    planName: input.planName,
    billingPeriod: input.billingPeriod,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    currency: 'USD',
    taxRate: input.taxRate,
    discount: input.discount,
    notes: input.notes,
    lineItems: (input.lineItems ?? []).map((item) => ({
      description: item.description,
      detail: item.detail,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
    })),
  }
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  const { data } = await api.superAdmin.invoices.create(toCreateBody(input))
  return mapInvoice(unwrapInvoice(data))
}

export async function markInvoicePaid(id: string): Promise<InvoiceActionResult> {
  try {
    const { data } = await api.superAdmin.invoices.markPaid(id, { paymentMethod: 'Manual' })
    return {
      ok: true,
      invoice: mapInvoice(unwrapInvoice(data)),
      messageKey: 'toast.markedPaid',
    }
  } catch (error) {
    return mapActionError(error)
  }
}

export async function sendInvoice(id: string): Promise<InvoiceActionResult> {
  void id
  return { ok: false, reason: 'unavailable', messageKey: 'actions.sendSoon' }
}

export async function downloadInvoice(id: string): Promise<InvoiceActionResult> {
  void id
  return { ok: false, reason: 'unavailable', messageKey: 'actions.downloadSoon' }
}

export async function regenerateInvoice(id: string): Promise<InvoiceActionResult> {
  try {
    const { data } = await api.superAdmin.invoices.regenerate(id)
    return {
      ok: true,
      invoice: mapInvoice(unwrapInvoice(data)),
      messageKey: 'toast.regenerated',
    }
  } catch (error) {
    return mapActionError(error)
  }
}

export type { InvoiceStatus, InvoiceBillingPeriod }
