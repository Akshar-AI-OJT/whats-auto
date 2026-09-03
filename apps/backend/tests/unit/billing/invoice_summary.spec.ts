import { test } from '@japa/runner'
import type { InvoiceRow } from '#repositories/invoice_repository'
import { buildInvoiceSummary } from '#transformers/invoice_transformer'

function invoice(overrides: Partial<InvoiceRow>): InvoiceRow {
  return {
    id: 'inv-1',
    organizationId: 'org-1',
    subscriptionId: null,
    planId: null,
    paymentTransactionId: null,
    sourceInvoiceId: null,
    invoiceNumber: 'INV-2026-000001',
    status: 'paid',
    billingPeriod: 'monthly',
    planName: 'Growth',
    periodStart: '2026-09-01',
    periodEnd: '2026-10-01',
    issueDate: '2026-09-02',
    dueDate: '2026-09-10',
    currency: 'INR',
    subtotal: 100,
    taxRate: 0.18,
    tax: 18,
    discount: 0,
    total: 118,
    notes: null,
    paymentMethod: null,
    billToName: 'Acme',
    billToEmail: 'ops@acme.com',
    billToPhone: null,
    billToAddress: null,
    billToGstin: null,
    metadata: {},
    paidAt: '2026-09-02T10:00:00.000Z',
    cancelledAt: null,
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: null,
    ...overrides,
  }
}

test.group('buildInvoiceSummary', () => {
  test('counts only paid invoices issued this month as monthly revenue', ({ assert }) => {
    const now = new Date('2026-09-15T12:00:00.000Z')
    const summary = buildInvoiceSummary(
      [
        invoice({ id: 'paid-this-month', status: 'paid', total: 118, issueDate: '2026-09-02' }),
        invoice({
          id: 'pending-this-month',
          status: 'pending',
          total: 236,
          issueDate: '2026-09-03',
          dueDate: '2026-09-30',
          paidAt: null,
        }),
        invoice({
          id: 'cancelled-this-month',
          status: 'cancelled',
          total: 99,
          issueDate: '2026-09-04',
          cancelledAt: '2026-09-04T12:00:00.000Z',
          paidAt: null,
        }),
        invoice({ id: 'paid-last-month', status: 'paid', total: 500, issueDate: '2026-08-20' }),
      ],
      now
    )

    assert.equal(summary.currency, 'INR')
    assert.equal(summary.thisMonthCount, 1)
    assert.equal(summary.thisMonthAmount, 118)
    assert.equal(summary.paidCount, 2)
    assert.equal(summary.paidAmount, 618)
    assert.equal(summary.pendingCount, 1)
    assert.equal(summary.pendingAmount, 236)
    assert.equal(summary.cancelledCount, 1)
    assert.equal(summary.cancelledAmount, 99)
  })

  test('treats overdue pending invoices separately from monthly revenue', ({ assert }) => {
    const now = new Date('2026-09-15T12:00:00.000Z')
    const summary = buildInvoiceSummary(
      [
        invoice({
          id: 'overdue',
          status: 'pending',
          total: 249.5,
          issueDate: '2026-09-01',
          dueDate: '2026-09-10',
          paidAt: null,
        }),
      ],
      now
    )

    assert.equal(summary.overdueCount, 1)
    assert.equal(summary.overdueAmount, 249.5)
    assert.equal(summary.thisMonthCount, 0)
    assert.equal(summary.thisMonthAmount, 0)
  })

  test('uses the majority invoice currency and rounds money', ({ assert }) => {
    const now = new Date('2026-09-15T12:00:00.000Z')
    const summary = buildInvoiceSummary(
      [
        invoice({ id: 'inr-1', currency: 'INR', total: 10.004, status: 'paid' }),
        invoice({ id: 'inr-2', currency: 'INR', total: 20.006, status: 'paid' }),
        invoice({ id: 'usd-1', currency: 'USD', total: 5, status: 'paid' }),
      ],
      now
    )

    assert.equal(summary.currency, 'INR')
    assert.equal(summary.thisMonthAmount, 35.01)
    assert.equal(summary.paidAmount, 35.01)
  })

  test('defaults currency to INR when there are no invoices', ({ assert }) => {
    const summary = buildInvoiceSummary([])
    assert.equal(summary.currency, 'INR')
    assert.equal(summary.thisMonthAmount, 0)
    assert.equal(summary.totalCount, 0)
  })
})
