import { test } from '@japa/runner'
import { buildInvoicePdfBuffer, invoicePdfFilename } from '#lib/invoice_pdf'
import {
  BILLING_PROFILE_NOT_CONFIGURED,
  RETIRED_MOCK_SELLER_GSTIN,
  mapPlatformSettingsToBillingProfile,
} from '#lib/platform_billing_profile'
import type { SuperAdminInvoice } from '#types/invoices'

function sampleInvoice(overrides: Partial<SuperAdminInvoice> = {}): SuperAdminInvoice {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    invoiceNumber: 'INV-2026-000512',
    organization: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Acme Solutions',
      email: 'billing@acme.test',
      phone: '+91 98765 43210',
      address: 'Cyber Hub, Gurugram',
      gstin: '06AABCA1234F1Z8',
    },
    planName: 'Growth',
    billingPeriod: 'monthly',
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-08-31T00:00:00.000Z',
    status: 'pending',
    issueDate: '2026-08-01',
    dueDate: '2026-08-15',
    currency: 'INR',
    lineItems: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        description: 'Growth Plan',
        detail: 'growth · monthly',
        quantity: 1,
        unitPrice: 2499,
        amount: 2499,
      },
    ],
    subtotal: 2499,
    tax: 449.82,
    taxRate: 0.18,
    discount: 0,
    total: 2948.82,
    notes: 'Thank you for your business.',
    paymentMethod: null,
    transactionId: null,
    paymentDate: null,
    organizationId: '22222222-2222-4222-8222-222222222222',
    subscriptionId: null,
    planId: null,
    paymentTransactionId: null,
    sourceInvoiceId: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: null,
    ...overrides,
  }
}

test.group('invoice PDF generator', () => {
  test('builds a structured PDF matching preview labels and billed-to email', ({ assert }) => {
    const invoice = sampleInvoice()
    const pdf = buildInvoicePdfBuffer(invoice)
    const text = pdf.toString('latin1')

    assert.isTrue(pdf.subarray(0, 5).equals(Buffer.from('%PDF-')))
    assert.include(text, '%%EOF')
    assert.include(text, invoice.invoiceNumber)
    assert.include(text, 'billing@acme.test')
    assert.include(text, 'Growth Plan')
    assert.include(text, 'growth')
    assert.include(text, 'monthly')
    assert.include(text, 'INR 2948.82')
    assert.include(text, 'FROM')
    assert.include(text, 'BILLED TO')
    assert.include(text, 'SUBSCRIPTION / PLAN')
    assert.include(text, 'ORGANIZATION')
    assert.include(text, 'Pending')
    assert.equal(invoicePdfFilename(invoice.invoiceNumber), 'invoice-INV-2026-000512.pdf')
    assert.notInclude(text, RETIRED_MOCK_SELLER_GSTIN)
    assert.include(text, BILLING_PROFILE_NOT_CONFIGURED)
    // Empty issuer GSTIN uses the same em-dash fallback as the Invoice preview (`—` via WinAnsi).
    assert.include(text, `GSTIN: ${String.fromCharCode(0x97)}`)
    // Middle dot in line-item detail must not collapse to `?`.
    assert.notInclude(text, 'growth ? monthly')
    assert.include(text, `growth ${String.fromCharCode(0xb7)} monthly`)
  })

  test('configured seller identity is printed and mock GSTIN is absent', ({ assert }) => {
    const invoice = sampleInvoice()
    const platform = mapPlatformSettingsToBillingProfile({
      billingBrandName: 'Live Brand',
      billingLegalName: 'Live Brand Pvt Ltd',
      billingAddress: 'FC Road, Pune',
      billingGstin: '27AABCU9603R1ZM',
      billingEmail: 'invoices@live-brand.test',
      billingPhone: '+91 20 0000 0000',
    })
    const pdf = buildInvoicePdfBuffer(invoice, platform)
    const text = pdf.toString('latin1')

    assert.include(text, 'Live Brand Pvt Ltd')
    assert.include(text, '27AABCU9603R1ZM')
    assert.include(text, 'invoices@live-brand.test')
    assert.include(text, 'Growth Plan')
    assert.include(text, 'INR 2499.00')
    assert.include(text, 'INR 2948.82')
    assert.include(text, 'GSTIN: 27AABCU9603R1ZM')
    assert.notInclude(text, RETIRED_MOCK_SELLER_GSTIN)
    assert.notInclude(text, 'Whats-Auto Technologies Pvt. Ltd.')
    assert.notInclude(text, 'billing@whatsauto.com')
  })

  test('omits customer GSTIN when absent and never invents one', ({ assert }) => {
    const invoice = sampleInvoice({
      organization: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'No Gstin Org',
        email: 'nogstin@acme.test',
        phone: null,
        address: null,
        gstin: null,
      },
    })
    const pdf = buildInvoicePdfBuffer(invoice)
    const text = pdf.toString('latin1')

    assert.include(text, 'No Gstin Org')
    assert.include(text, 'nogstin@acme.test')
    assert.notInclude(text, '06AABCA1234F1Z8')
    assert.notInclude(text, '27AAAAA0000A1Z5')
    assert.notInclude(text, RETIRED_MOCK_SELLER_GSTIN)
    // Only the issuer empty-fallback GSTIN line should appear.
    const gstinLines = text.split('GSTIN:').length - 1
    assert.equal(gstinLines, 1)
  })
})
