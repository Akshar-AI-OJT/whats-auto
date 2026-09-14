import type {
  CreateInvoiceInput,
  Invoice,
  InvoiceBillingPeriod,
  InvoiceLineItem,
  InvoiceOrganization,
} from './types'

export type InvoiceFormLineItem = {
  id: string
  description: string
  detail?: string
  quantity: number
  unitPrice: number
}

export type InvoiceDraftForm = {
  organizationId: string
  /** Live Super Admin plan UUID when selected from the catalog. */
  planId: string
  planName: string
  billingPeriod: InvoiceBillingPeriod
  periodStart: string
  periodEnd: string
  issueDate: string
  dueDate: string
  currency: 'INR'
  taxRatePercent: string
  discount: string
  lineItems: InvoiceFormLineItem[]
  notes: string
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export function lineItemAmount(item: Pick<InvoiceFormLineItem, 'quantity' | 'unitPrice'>) {
  return roundMoney(item.quantity * item.unitPrice)
}

export function computeInvoiceTotals(
  lineItems: InvoiceFormLineItem[],
  discountRaw: string,
  taxRatePercentRaw: string
) {
  const subtotal = roundMoney(
    lineItems.reduce((sum, item) => sum + lineItemAmount(item), 0)
  )
  const discount = roundMoney(Math.max(0, Number(discountRaw || '0') || 0))
  const taxRate = Math.max(0, Number(taxRatePercentRaw || '0') || 0) / 100
  const taxable = Math.max(0, subtotal - discount)
  const tax = roundMoney(taxable * taxRate)
  const total = roundMoney(taxable + tax)
  return { subtotal, discount, taxRate, tax, total }
}

export function planSubscriptionLabel(
  planName: string,
  billingPeriod: InvoiceBillingPeriod
): string {
  const suffix =
    billingPeriod === 'monthly'
      ? 'Monthly Subscription'
      : billingPeriod === 'yearly'
        ? 'Yearly Subscription'
        : 'Custom Subscription'
  return `${planName} Plan (${suffix})`
}

export function defaultLineItems(
  planName: string,
  billingPeriod: InvoiceBillingPeriod,
  unitPrice = 0
): InvoiceFormLineItem[] {
  return [
    {
      id: crypto.randomUUID(),
      description: planSubscriptionLabel(planName, billingPeriod),
      detail: 'Includes plan features for the selected billing period',
      quantity: 1,
      unitPrice,
    },
  ]
}

export function todayInput() {
  return new Date().toISOString().slice(0, 10)
}

export function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  const toInput = (d: Date) => d.toISOString().slice(0, 10)
  return { start: toInput(start), end: toInput(end) }
}

export function emptyDraftForm(): InvoiceDraftForm {
  const bounds = monthBounds()
  const issue = todayInput()
  return {
    organizationId: '',
    planId: '',
    planName: '',
    billingPeriod: 'monthly',
    periodStart: bounds.start,
    periodEnd: bounds.end,
    issueDate: issue,
    dueDate: issue,
    currency: 'INR',
    taxRatePercent: '18',
    discount: '0',
    notes: '',
    lineItems: defaultLineItems('', 'monthly', 0),
  }
}

export function formLineItemsToInvoiceLineItems(items: InvoiceFormLineItem[]): InvoiceLineItem[] {
  return items.map((item) => ({
    id: item.id,
    description: item.description,
    detail: item.detail,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    amount: lineItemAmount(item),
  }))
}

/** Build a live preview invoice from form state — no API call. */
export function buildDraftInvoice(
  form: InvoiceDraftForm,
  organization: InvoiceOrganization | null,
  options?: { invoiceNumber?: string; status?: Invoice['status'] }
): Invoice {
  const { subtotal, discount, taxRate, tax, total } = computeInvoiceTotals(
    form.lineItems,
    form.discount,
    form.taxRatePercent
  )
  const now = new Date().toISOString()
  const org: InvoiceOrganization = organization ?? {
    id: 'org_preview',
    name: '—',
    email: '—',
  }

  return {
    id: 'draft_preview',
    invoiceNumber: options?.invoiceNumber ?? 'INV-2026-PREVIEW',
    organization: org,
    planName: form.planName,
    billingPeriod: form.billingPeriod,
    periodStart: form.periodStart,
    periodEnd: form.periodEnd,
    status: options?.status ?? 'pending',
    issueDate: form.issueDate,
    dueDate: form.dueDate,
    currency: form.currency,
    lineItems: formLineItemsToInvoiceLineItems(form.lineItems),
    subtotal,
    discount,
    taxRate,
    tax,
    total,
    notes: form.notes.trim() || undefined,
    paymentMethod: null,
    transactionId: null,
    paymentDate: null,
    createdAt: now,
    updatedAt: now,
  }
}

export function draftFormToCreateInput(
  form: InvoiceDraftForm,
  organization: InvoiceOrganization
): CreateInvoiceInput {
  const lineItems = formLineItemsToInvoiceLineItems(form.lineItems)
  const primary = lineItems[0]

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    organizationEmail: organization.email,
    organizationPhone: organization.phone,
    organizationAddress: organization.address,
    organizationGstin: organization.gstin,
    planId: form.planId || undefined,
    planName: form.planName,
    billingPeriod: form.billingPeriod,
    periodStart: form.periodStart,
    periodEnd: form.periodEnd,
    issueDate: form.issueDate,
    dueDate: form.dueDate,
    amount: primary?.amount ?? 0,
    taxRate: Number(form.taxRatePercent) / 100,
    discount: Number(form.discount || '0'),
    notes: form.notes.trim() || undefined,
    lineItems,
  }
}

export function validateDraftForm(
  form: InvoiceDraftForm,
  messages: {
    organizationRequired: string
    planRequired: string
    datesRequired: string
    periodInvalid: string
    dueBeforeIssue: string
    discountInvalid: string
    taxInvalid: string
    lineItemsRequired: string
    lineItemInvalid: string
  }
): string | null {
  if (!form.organizationId) return messages.organizationRequired
  if (!form.planName.trim()) return messages.planRequired
  if (!form.periodStart || !form.periodEnd || !form.issueDate || !form.dueDate) {
    return messages.datesRequired
  }
  if (new Date(`${form.periodEnd}T00:00:00`) < new Date(`${form.periodStart}T00:00:00`)) {
    return messages.periodInvalid
  }
  if (new Date(`${form.dueDate}T00:00:00`) < new Date(`${form.issueDate}T00:00:00`)) {
    return messages.dueBeforeIssue
  }
  const discount = Number(form.discount || '0')
  if (!Number.isFinite(discount) || discount < 0) return messages.discountInvalid
  const taxRatePercent = Number(form.taxRatePercent || '0')
  if (!Number.isFinite(taxRatePercent) || taxRatePercent < 0 || taxRatePercent > 100) {
    return messages.taxInvalid
  }
  if (form.lineItems.length === 0) return messages.lineItemsRequired
  for (const item of form.lineItems) {
    if (!item.description.trim()) return messages.lineItemInvalid
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) return messages.lineItemInvalid
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) return messages.lineItemInvalid
  }
  return null
}
