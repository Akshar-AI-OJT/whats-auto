/** Stable Super Admin invoice API shapes (aligned with frontend admin invoice UI). */

export const INVOICE_STATUSES = ['paid', 'pending', 'overdue', 'cancelled'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const INVOICE_BILLING_PERIODS = ['monthly', 'yearly', 'custom'] as const
export type InvoiceBillingPeriod = (typeof INVOICE_BILLING_PERIODS)[number]

export type SuperAdminInvoiceOrganization = {
  id: string
  name: string
  email: string
  phone?: string | null
  address?: string | null
  gstin?: string | null
}

export type SuperAdminInvoiceLineItem = {
  id: string
  description: string
  detail?: string | null
  quantity: number
  unitPrice: number
  amount: number
}

export type SuperAdminInvoice = {
  id: string
  invoiceNumber: string
  organization: SuperAdminInvoiceOrganization
  planName: string
  billingPeriod: InvoiceBillingPeriod
  periodStart: string
  periodEnd: string
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  currency: string
  lineItems: SuperAdminInvoiceLineItem[]
  subtotal: number
  tax: number
  taxRate: number
  discount: number
  total: number
  notes?: string | null
  paymentMethod?: string | null
  transactionId?: string | null
  paymentDate?: string | null
  organizationId: string
  subscriptionId?: string | null
  planId?: string | null
  paymentTransactionId?: string | null
  sourceInvoiceId?: string | null
  createdAt: string
  updatedAt: string | null
}

export type SuperAdminInvoiceSummary = {
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

export type SuperAdminInvoiceActionResult = {
  ok: boolean
  invoice?: SuperAdminInvoice
  messageKey?: string
  reason?: 'not_found' | 'unavailable' | 'invalid'
}
