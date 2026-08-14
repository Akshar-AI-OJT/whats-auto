import vine from '@vinejs/vine'
import { INVOICE_BILLING_PERIODS, INVOICE_STATUSES } from '#types/invoices'

export const listSuperAdminInvoicesValidator = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).max(100).optional(),
    search: vine.string().trim().optional(),
    status: vine.enum([...INVOICE_STATUSES, 'all']).optional(),
    issueMonth: vine.string().trim().optional(),
    billingPeriod: vine.enum([...INVOICE_BILLING_PERIODS, 'all']).optional(),
  })
)

export const invoiceSummaryValidator = vine.create(
  vine.object({
    search: vine.string().trim().optional(),
    status: vine.enum([...INVOICE_STATUSES, 'all']).optional(),
    issueMonth: vine.string().trim().optional(),
    billingPeriod: vine.enum([...INVOICE_BILLING_PERIODS, 'all']).optional(),
  })
)

export const invoiceIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)

const invoiceLineItemInput = vine.object({
  description: vine.string().trim().minLength(1).maxLength(500),
  detail: vine.string().trim().maxLength(2000).optional(),
  quantity: vine.number().min(0.0001).max(999999),
  unitPrice: vine.number().min(0).max(999999999),
  amount: vine.number().min(0).max(999999999),
})

export const createSuperAdminInvoiceValidator = vine.create(
  vine.object({
    organizationId: vine.string().trim().uuid(),
    subscriptionId: vine.string().trim().uuid().optional(),
    planId: vine.string().trim().uuid().optional(),
    organizationName: vine.string().trim().minLength(1).maxLength(255),
    organizationEmail: vine.string().trim().email(),
    organizationPhone: vine.string().trim().maxLength(50).optional(),
    organizationAddress: vine.string().trim().maxLength(2000).optional(),
    organizationGstin: vine.string().trim().maxLength(20).optional(),
    planName: vine.string().trim().minLength(1).maxLength(255),
    billingPeriod: vine.enum(INVOICE_BILLING_PERIODS),
    periodStart: vine.date(),
    periodEnd: vine.date(),
    issueDate: vine.date(),
    dueDate: vine.date(),
    currency: vine.string().trim().fixedLength(3).optional(),
    taxRate: vine.number().min(0).max(1).optional(),
    discount: vine.number().min(0).optional(),
    notes: vine.string().trim().maxLength(5000).optional(),
    lineItems: vine.array(invoiceLineItemInput).minLength(1),
  })
)

export const markSuperAdminInvoicePaidValidator = vine.create(
  vine.object({
    paymentMethod: vine.string().trim().maxLength(100).optional(),
    paymentTransactionId: vine.string().trim().uuid().optional(),
  })
)

export const regenerateSuperAdminInvoiceValidator = vine.create(
  vine.object({
    issueDate: vine.date().optional(),
    dueDate: vine.date().optional(),
  })
)
