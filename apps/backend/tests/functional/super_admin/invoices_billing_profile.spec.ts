import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import mail from '@adonisjs/mail/services/main'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { RETIRED_MOCK_SELLER_GSTIN } from '#lib/platform_billing_profile'
import { InvoiceService } from '#services/billing/invoice_service'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { runWithTenant } from '#services/tenant_context'
import { PLATFORM_SETTINGS_SINGLETON_KEY } from '#types/platform_settings'

const BILLING_PROFILE_PATH = '/api/v1/super-admin/invoices/billing-profile'
const SETTINGS_PATH = '/api/v1/super-admin/platform-settings'

const CONFIGURED = {
  billingBrandName: 'BUG022 Brand',
  billingLegalName: 'BUG022 Legal Pvt Ltd',
  billingTagline: 'Test invoices',
  billingAddress: 'FC Road, Pune',
  billingGstin: '27AABCU9603R1ZM',
  billingEmail: 'invoices@bug022.test',
  billingPhone: '+91 20 1111 2222',
  billingWebsite: 'www.bug022.test',
}

async function restoreBillingDefaults() {
  await db.from('platform_settings').where('singletonKey', PLATFORM_SETTINGS_SINGLETON_KEY).update({
    billingBrandName: '',
    billingLegalName: '',
    billingTagline: '',
    billingAddress: '',
    billingGstin: '',
    billingEmail: '',
    billingPhone: '',
    billingWebsite: '',
  })
}

function unwrapData(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {}
  const root = body as { data?: Record<string, unknown> }
  return root.data && typeof root.data === 'object' ? root.data : (body as Record<string, unknown>)
}

function errorBody(response: { body: () => unknown }): { code?: string; error?: string } {
  return response.body() as { code?: string; error?: string }
}

function asPdfBuffer(response: { body: () => unknown; text: () => string }): Buffer {
  const body = response.body()
  if (Buffer.isBuffer(body)) return body
  if (body instanceof Uint8Array) return Buffer.from(body)
  if (typeof body === 'string') return Buffer.from(body, 'latin1')
  return Buffer.from(response.text(), 'latin1')
}

async function mintToken(email: string, activeOrgId?: string): Promise<string> {
  const result = (await auth.api.signInEmail({
    body: { email, password: DEMO_PASSWORD },
  })) as { token?: string; user?: { id: string; name: string; email: string } }

  if (!result.token || !result.user?.id) {
    throw new Error(`Failed to sign in ${email}`)
  }

  const sessionRow = await db.from('sessions').where('token', result.token).select('id').first()
  if (!sessionRow?.id) {
    throw new Error(`No session row after sign-in for ${email}`)
  }

  if (activeOrgId) {
    await db
      .from('sessions')
      .where('id', sessionRow.id)
      .update({ activeOrganizationId: activeOrgId })
  }

  const payload = await new AccessTokenClaimsService().build({
    user: {
      id: result.user.id,
      email,
      name: result.user.name ?? email,
    },
    session: { id: sessionRow.id as string, activeOrganizationId: activeOrgId ?? null },
  })

  const signed = await auth.api.signJWT({
    body: { payload: payload as Record<string, unknown> },
  })
  const token = (signed as { token?: string } | null)?.token
  if (!token) {
    throw new Error(`signJWT returned no token for ${email}`)
  }
  return token
}

test.group('BUG-022 Super Admin invoice billing profile', (group) => {
  const createdInvoices: Array<{ id: string; organizationId: string }> = []

  group.tap((t) => t.timeout(30_000))

  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.each.setup(async () => {
    await restoreBillingDefaults()
    mail.fake()
  })

  group.each.teardown(async () => {
    mail.restore()
    await restoreBillingDefaults()
  })

  group.teardown(async () => {
    for (const created of createdInvoices) {
      await runWithTenant(created.organizationId, async () => {
        await db.from('invoice_line_items').where('invoiceId', created.id).delete()
        await db.from('invoices').where('id', created.id).delete()
      })
      await db.from('authorization_audits').where('targetId', created.id).delete()
    }
  })

  async function seedInvoice(suffix: string) {
    const organizationId = FIXTURE_IDS.orgs.northstar
    const invoice = await new InvoiceService().createInvoice({
      organizationId,
      organizationName: `BUG022 ${suffix}`,
      organizationEmail: 'billing.bug022@example.com',
      planName: 'Growth',
      billingPeriod: 'monthly',
      periodStart: DateTime.fromISO('2026-08-01'),
      periodEnd: DateTime.fromISO('2026-09-01'),
      issueDate: DateTime.fromISO('2026-08-02'),
      dueDate: DateTime.fromISO('2026-08-16'),
      currency: 'INR',
      taxRate: 0.18,
      discount: 0,
      notes: 'BUG-022 invoice',
      lineItems: [
        {
          description: 'Growth Plan',
          detail: 'Monthly subscription',
          quantity: 1,
          unitPrice: 2499,
          amount: 2499,
        },
      ],
    })
    createdInvoices.push({ id: invoice.id, organizationId })
    return invoice
  }

  test('unconfigured billing-profile GET does not use the mock GSTIN', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(BILLING_PROFILE_PATH)
      .header('Authorization', `Bearer ${token}`)
    response.assertStatus(200)

    const data = unwrapData(response.body())
    const payload = JSON.stringify(response.body())
    assert.equal(data.legalName, 'Not configured')
    assert.equal(data.gstin, '')
    assert.notInclude(payload, RETIRED_MOCK_SELLER_GSTIN)
    assert.notInclude(payload, 'Whats-Auto Technologies Pvt. Ltd.')
    assert.notInclude(payload, 'billing@whatsauto.com')
  })

  test('configured seller identity is returned on billing-profile GET and persisted', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const patched = await client
      .patch(SETTINGS_PATH)
      .header('Authorization', `Bearer ${token}`)
      .json(CONFIGURED)
    patched.assertStatus(200)
    assert.equal(unwrapData(patched.body()).billingLegalName, CONFIGURED.billingLegalName)
    assert.equal(unwrapData(patched.body()).billingGstin, CONFIGURED.billingGstin)

    const row = await db
      .from('platform_settings')
      .where('singletonKey', PLATFORM_SETTINGS_SINGLETON_KEY)
      .first()
    assert.equal(row?.billingLegalName, CONFIGURED.billingLegalName)
    assert.equal(row?.billingGstin, CONFIGURED.billingGstin)

    const profile = await client
      .get(BILLING_PROFILE_PATH)
      .header('Authorization', `Bearer ${token}`)
    profile.assertStatus(200)
    const data = unwrapData(profile.body())
    assert.equal(data.brandName, CONFIGURED.billingBrandName)
    assert.equal(data.legalName, CONFIGURED.billingLegalName)
    assert.equal(data.gstin, CONFIGURED.billingGstin)
    assert.equal(data.email, CONFIGURED.billingEmail)
    assert.deepEqual(data.addressLines, ['FC Road, Pune'])
    assert.notInclude(JSON.stringify(profile.body()), RETIRED_MOCK_SELLER_GSTIN)
  })

  test('download PDF uses configured seller identity and keeps line totals', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    await client.patch(SETTINGS_PATH).header('Authorization', `Bearer ${token}`).json(CONFIGURED)

    const created = await seedInvoice('download')
    const response = await client
      .get(`/api/v1/super-admin/invoices/${created.id}/download`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const pdf = asPdfBuffer(response)
    const text = pdf.toString('latin1')
    assert.isTrue(pdf.subarray(0, 5).equals(Buffer.from('%PDF-')))
    assert.include(text, created.invoiceNumber)
    assert.include(text, CONFIGURED.billingLegalName)
    assert.include(text, CONFIGURED.billingGstin)
    assert.include(text, CONFIGURED.billingEmail)
    assert.include(text, 'Growth Plan')
    assert.include(text, 'INR 2499.00')
    assert.include(text, 'INR 2948.82')
    assert.notInclude(text, RETIRED_MOCK_SELLER_GSTIN)
    assert.notInclude(text, 'Whats-Auto Technologies Pvt. Ltd.')
    assert.notInclude(text, 'billing@whatsauto.com')
  })

  test('send email uses configured seller identity', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    await client.patch(SETTINGS_PATH).header('Authorization', `Bearer ${token}`).json(CONFIGURED)

    const created = await seedInvoice('send')
    let capturedSubject = ''
    let capturedText = ''
    const originalSend = mail.send.bind(mail)
    Object.assign(mail, {
      send: async (callback: Parameters<typeof mail.send>[0]) => {
        return originalSend((message) => {
          const originalSubject = message.subject.bind(message)
          message.subject = ((value: string) => {
            capturedSubject = value
            return originalSubject(value)
          }) as typeof message.subject
          const originalText = message.text.bind(message)
          message.text = ((value: string) => {
            capturedText = value
            return originalText(value)
          }) as typeof message.text
          return callback(message)
        })
      },
    })

    try {
      const response = await client
        .post(`/api/v1/super-admin/invoices/${created.id}/send`)
        .header('Authorization', `Bearer ${token}`)
        .json({})
      response.assertStatus(200)
      assert.include(capturedSubject, CONFIGURED.billingBrandName)
      assert.include(capturedText, CONFIGURED.billingEmail)
      assert.notInclude(capturedSubject, RETIRED_MOCK_SELLER_GSTIN)
      assert.notInclude(capturedText, RETIRED_MOCK_SELLER_GSTIN)
      assert.notInclude(capturedText, 'billing@whatsauto.com')
    } finally {
      Object.assign(mail, { send: originalSend })
    }
  })

  test('unconfigured download PDF does not contain the mock GSTIN', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const created = await seedInvoice('empty')
    const response = await client
      .get(`/api/v1/super-admin/invoices/${created.id}/download`)
      .header('Authorization', `Bearer ${token}`)
    response.assertStatus(200)
    const text = asPdfBuffer(response).toString('latin1')
    assert.include(text, created.invoiceNumber)
    assert.include(text, 'Growth Plan')
    assert.notInclude(text, RETIRED_MOCK_SELLER_GSTIN)
    assert.notInclude(text, 'Plot 12, Sector 62, Noida')
  })

  test('tenant user cannot read billing-profile or change billing settings', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)

    const getProfile = await client
      .get(BILLING_PROFILE_PATH)
      .header('Authorization', `Bearer ${token}`)
    getProfile.assertStatus(403)

    const patch = await client
      .patch(SETTINGS_PATH)
      .header('Authorization', `Bearer ${token}`)
      .json({ billingGstin: CONFIGURED.billingGstin, billingLegalName: 'ShouldNotPersist' })
    patch.assertStatus(403)
    assert.equal(errorBody(patch).code, 'PLATFORM_ACCESS_DENIED')

    const row = await db
      .from('platform_settings')
      .where('singletonKey', PLATFORM_SETTINGS_SINGLETON_KEY)
      .first()
    assert.equal(row?.billingGstin, '')
    assert.equal(row?.billingLegalName, '')
  })

  test('unauthenticated billing-profile returns 401', async ({ client }) => {
    const response = await client.get(BILLING_PROFILE_PATH)
    response.assertStatus(401)
  })
})
