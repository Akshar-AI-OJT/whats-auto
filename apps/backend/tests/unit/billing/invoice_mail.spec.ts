import { test } from '@japa/runner'
import { buildInvoiceEmail } from '#services/billing/invoice_mail'
import {
  BILLING_PROFILE_NOT_CONFIGURED,
  RETIRED_MOCK_SELLER_GSTIN,
  mapPlatformSettingsToBillingProfile,
} from '#lib/platform_billing_profile'
import type { SuperAdminInvoice } from '#types/invoices'

function sampleInvoice(): SuperAdminInvoice {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    invoiceNumber: 'INV-2026-000512',
    organization: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Acme Solutions',
      email: 'billing@acme.test',
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
    organizationId: '22222222-2222-4222-8222-222222222222',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: null,
  }
}

test.group('BUG-022 invoice email seller identity', () => {
  test('configured profile appears in subject and body', ({ assert }) => {
    const platform = mapPlatformSettingsToBillingProfile({
      billingBrandName: 'Northstar Billing',
      billingLegalName: 'Northstar Billing Pvt Ltd',
      billingEmail: 'invoices@northstar-billing.test',
      billingGstin: '27AABCU9603R1ZM',
    })
    const mail = buildInvoiceEmail(sampleInvoice(), platform)

    assert.include(mail.subject, 'Northstar Billing')
    assert.include(mail.text, 'invoices@northstar-billing.test')
    assert.include(mail.html, 'Northstar Billing')
    assert.include(mail.text, 'INR 2948.82')
    assert.notInclude(mail.subject, RETIRED_MOCK_SELLER_GSTIN)
    assert.notInclude(mail.text, RETIRED_MOCK_SELLER_GSTIN)
    assert.notInclude(mail.html, RETIRED_MOCK_SELLER_GSTIN)
    assert.notInclude(mail.text, 'billing@whatsauto.com')
  })

  test('unconfigured profile does not use the mock GSTIN or mock email', ({ assert }) => {
    const mail = buildInvoiceEmail(sampleInvoice())
    assert.include(mail.subject, BILLING_PROFILE_NOT_CONFIGURED)
    assert.notInclude(mail.text, RETIRED_MOCK_SELLER_GSTIN)
    assert.notInclude(mail.html, RETIRED_MOCK_SELLER_GSTIN)
    assert.notInclude(mail.text, 'billing@whatsauto.com')
    assert.notInclude(mail.text, 'Whats-Auto Technologies Pvt. Ltd.')
  })
})
