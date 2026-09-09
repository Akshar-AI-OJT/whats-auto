import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import mail from '@adonisjs/mail/services/main'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { InvoiceService } from '#services/billing/invoice_service'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { runWithTenant } from '#services/tenant_context'

type InvoiceRow = {
  id: string
  invoiceNumber: string
  organizationId: string
  status: string
}

function unwrapList(body: unknown): InvoiceRow[] {
  if (!body || typeof body !== 'object') return []
  const root = body as { data?: InvoiceRow[] | { data?: InvoiceRow[] } }
  if (Array.isArray(root.data)) return root.data
  if (root.data && typeof root.data === 'object' && Array.isArray(root.data.data)) {
    return root.data.data
  }
  return []
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

test.group('BUG-016 Super Admin invoice send and download', (group) => {
  const createdInvoices: Array<{ id: string; organizationId: string }> = []

  group.tap((t) => t.timeout(30_000))

  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.each.setup(() => {
    mail.fake()
  })

  group.each.teardown(() => {
    mail.restore()
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

  async function seedInvoice(
    organizationId: string,
    email: string,
    suffix: string
  ): Promise<InvoiceRow> {
    const invoice = await new InvoiceService().createInvoice({
      organizationId,
      organizationName: `BUG016 ${suffix}`,
      organizationEmail: email,
      planName: 'Growth',
      billingPeriod: 'monthly',
      periodStart: DateTime.fromISO('2026-08-01'),
      periodEnd: DateTime.fromISO('2026-09-01'),
      issueDate: DateTime.fromISO('2026-08-02'),
      dueDate: DateTime.fromISO('2026-08-16'),
      currency: 'INR',
      taxRate: 0.18,
      discount: 0,
      notes: 'BUG-016 invoice',
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
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      organizationId: invoice.organizationId,
      status: invoice.status,
    }
  }

  test('invoice list still returns created invoices', async ({ client, assert }) => {
    const created = await seedInvoice(
      FIXTURE_IDS.orgs.northstar,
      'billing.northstar@example.com',
      'list'
    )

    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get('/api/v1/super-admin/invoices')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: created.invoiceNumber })

    response.assertStatus(200)
    const items = unwrapList(response.body())
    assert.isTrue(items.some((item) => item.id === created.id))
  })

  test('authorized Super Admin can send an invoice email', async ({ client, assert }) => {
    const recipient = 'billing.send@example.com'
    const created = await seedInvoice(FIXTURE_IDS.orgs.northstar, recipient, 'send')
    const token = await mintToken(DEMO_USERS.superadmin)
    const originalSend = mail.send.bind(mail)
    let sendCount = 0
    Object.assign(mail, {
      send: async (...args: Parameters<typeof mail.send>) => {
        sendCount += 1
        return originalSend(...args)
      },
    })

    try {
      const response = await client
        .post(`/api/v1/super-admin/invoices/${created.id}/send`)
        .header('Authorization', `Bearer ${token}`)
        .json({})

      response.assertStatus(200)
      assert.notEqual(response.status(), 501)
      const body = response.body() as { data?: { ok?: boolean; invoiceNumber?: string } }
      assert.isTrue(body.data?.ok === true)
      assert.equal(body.data?.invoiceNumber, created.invoiceNumber)
      assert.equal(sendCount, 1)
    } finally {
      Object.assign(mail, { send: originalSend })
    }

    const audit = await db
      .from('authorization_audits')
      .where('targetId', created.id)
      .where('eventType', 'invoice.sent')
      .first()
    assert.exists(audit)
    assert.equal(audit?.organizationId, FIXTURE_IDS.orgs.northstar)
  })

  test('authorized Super Admin can download an invoice PDF', async ({ client, assert }) => {
    const created = await seedInvoice(
      FIXTURE_IDS.orgs.northstar,
      'billing.download@example.com',
      'download'
    )
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(`/api/v1/super-admin/invoices/${created.id}/download`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.notEqual(response.status(), 501)
    const contentType = String(response.header('content-type') ?? '')
    assert.include(contentType, 'application/pdf')
    const disposition = String(response.header('content-disposition') ?? '')
    assert.include(disposition, `invoice-${created.invoiceNumber}.pdf`)

    const pdf = asPdfBuffer(response)
    assert.isTrue(pdf.subarray(0, 5).equals(Buffer.from('%PDF-')))
    assert.include(pdf.toString('latin1'), created.invoiceNumber)
  })

  test('mail transport failure does not return a successful send', async ({ client, assert }) => {
    const created = await seedInvoice(
      FIXTURE_IDS.orgs.northstar,
      'billing.fail@example.com',
      'fail'
    )
    mail.restore()
    const originalSend = mail.send.bind(mail)
    Object.assign(mail, {
      send: async () => {
        throw new Error('smtp unavailable')
      },
    })

    try {
      const token = await mintToken(DEMO_USERS.superadmin)
      const response = await client
        .post(`/api/v1/super-admin/invoices/${created.id}/send`)
        .header('Authorization', `Bearer ${token}`)
        .json({})

      response.assertStatus(502)
      assert.equal(errorBody(response).code, 'E_INVOICE_SEND_FAILED')
      assert.notEqual(response.status(), 200)
    } finally {
      Object.assign(mail, { send: originalSend })
    }
  })

  test('nonexistent invoice returns 404 for send and download', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const missingId = randomUUID()

    const send = await client
      .post(`/api/v1/super-admin/invoices/${missingId}/send`)
      .header('Authorization', `Bearer ${token}`)
      .json({})
    send.assertStatus(404)
    assert.equal(errorBody(send).code, 'E_INVOICE_NOT_FOUND')

    const download = await client
      .get(`/api/v1/super-admin/invoices/${missingId}/download`)
      .header('Authorization', `Bearer ${token}`)
    download.assertStatus(404)
    assert.equal(errorBody(download).code, 'E_INVOICE_NOT_FOUND')
  })

  test('invoice without a billing email cannot be sent', async ({ client, assert }) => {
    const created = await seedInvoice(
      FIXTURE_IDS.orgs.northstar,
      'billing.empty@example.com',
      'empty'
    )
    await runWithTenant(FIXTURE_IDS.orgs.northstar, async () => {
      await db.from('invoices').where('id', created.id).update({ billToEmail: '' })
    })

    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .post(`/api/v1/super-admin/invoices/${created.id}/send`)
      .header('Authorization', `Bearer ${token}`)
      .json({})

    response.assertStatus(422)
    assert.equal(errorBody(response).code, 'E_INVOICE_RECIPIENT_MISSING')
    assert.notEqual(response.status(), 200)
  })

  test('tenant user cannot send or download Super Admin invoices', async ({ client }) => {
    const created = await seedInvoice(
      FIXTURE_IDS.orgs.harbor,
      'billing.harbor@example.com',
      'tenant'
    )
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)

    const send = await client
      .post(`/api/v1/super-admin/invoices/${created.id}/send`)
      .header('Authorization', `Bearer ${token}`)
      .json({})
    send.assertStatus(403)

    const download = await client
      .get(`/api/v1/super-admin/invoices/${created.id}/download`)
      .header('Authorization', `Bearer ${token}`)
    download.assertStatus(403)
  })

  test('unauthenticated request returns 401', async ({ client }) => {
    const invoiceId = randomUUID()
    const send = await client.post(`/api/v1/super-admin/invoices/${invoiceId}/send`).json({})
    send.assertStatus(401)

    const download = await client.get(`/api/v1/super-admin/invoices/${invoiceId}/download`)
    download.assertStatus(401)
  })

  test('invalid invoice id returns 422', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const send = await client
      .post('/api/v1/super-admin/invoices/not-a-uuid/send')
      .header('Authorization', `Bearer ${token}`)
      .json({})
    send.assertStatus(422)

    const download = await client
      .get('/api/v1/super-admin/invoices/not-a-uuid/download')
      .header('Authorization', `Bearer ${token}`)
    download.assertStatus(422)
  })
})
