/** Frontend invoice model. Map backend payloads into this shape when APIs exist. */

export const INVOICE_STATUSES = ['paid', 'pending', 'overdue', 'cancelled'] as const

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const BILLING_PERIODS = ['monthly', 'yearly', 'custom'] as const

export type InvoiceBillingPeriod = (typeof BILLING_PERIODS)[number]

export type InvoiceLineItem = {
  id: string
  description: string
  detail?: string
  quantity: number
  unitPrice: number
  amount: number
}

export type InvoiceOrganization = {
  id: string
  name: string
  email: string
  phone?: string
  address?: string
  gstin?: string
}

export type Invoice = {
  id: string
  invoiceNumber: string
  organization: InvoiceOrganization
  planName: string
  billingPeriod: InvoiceBillingPeriod
  periodStart: string
  periodEnd: string
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  currency: string
  lineItems: InvoiceLineItem[]
  subtotal: number
  /** Absolute tax amount (not rate). */
  tax: number
  /** Tax rate as fraction, e.g. 0.18 for 18%. */
  taxRate: number
  discount: number
  total: number
  notes?: string
  paymentMethod?: string | null
  transactionId?: string | null
  paymentDate?: string | null
  createdAt: string
  updatedAt: string
}

export type CreateInvoiceInput = {
  organizationId: string
  organizationName: string
  organizationEmail: string
  organizationPhone?: string
  organizationAddress?: string
  organizationGstin?: string
  planName: string
  billingPeriod: InvoiceBillingPeriod
  periodStart: string
  periodEnd: string
  issueDate: string
  dueDate: string
  /** Primary line amount before tax/discount (legacy; prefer lineItems). */
  amount: number
  taxRate?: number
  discount?: number
  notes?: string
  lineItems?: Array<{
    description: string
    detail?: string
    quantity: number
    unitPrice: number
    amount: number
  }>
  extraLineDescription?: string
  extraLineAmount?: number
}

export type ListInvoicesParams = {
  page?: number
  perPage?: number
  search?: string
  status?: InvoiceStatus | 'all'
  /** YYYY-MM for issue-date month filter */
  issueMonth?: string | 'all'
  billingPeriod?: InvoiceBillingPeriod | 'all'
}

export type InvoiceListResult = {
  items: Invoice[]
  total: number
  page: number
  perPage: number
  lastPage: number
}

export type InvoiceSummary = {
  totalCount: number
  paidCount: number
  paidAmount: number
  pendingCount: number
  pendingAmount: number
  overdueCount: number
  overdueAmount: number
  cancelledCount: number
  cancelledAmount: number
  thisMonthCount: number
  thisMonthAmount: number
}

export type InvoiceActionResult =
  | { ok: true; invoice?: Invoice; messageKey?: string }
  | { ok: false; reason: 'not_found' | 'unavailable' | 'invalid'; messageKey: string }

/** Static platform “From” block for invoice documents (mock until billing settings API exists). */
export type PlatformBillingProfile = {
  brandName: string
  legalName: string
  tagline: string
  addressLines: string[]
  gstin: string
  email: string
  phone: string
  website: string
}
