import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { InvoiceService } from '#services/billing/invoice_service'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { runWithTenant } from '#services/tenant_context'
import { assertListEnvelope, unwrapListEnvelope } from '#tests/helpers/list_envelope'

type InvoiceListItem = {
  id: string
  invoiceNumber: string
  status: string
  dueDate?: string
  planName?: string
}

type PaginationMeta = {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
}

function unwrapList(body: unknown): { items: InvoiceListItem[]; meta: PaginationMeta | null } {
  return unwrapListEnvelope<InvoiceListItem>(body)
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

test.group('BUG-018 Super Admin pending vs overdue invoices', (group) => {
  const createdInvoices: Array<{ id: string; organizationId: string }> = []
  const organizationId = FIXTURE_IDS.orgs.northstar
  const needle = `Bug018 ${randomUUID().slice(0, 8)}`
  const pageNeedle = `${needle} Page`
  const emptyNeedle = `Bug018Nomatch ${randomUUID()}`

  const utcToday = DateTime.utc().toISODate()!
  const utcYesterday = DateTime.utc().minus({ days: 1 }).toISODate()!
  const utcTomorrow = DateTime.utc().plus({ days: 1 }).toISODate()!
  const utcLastWeek = DateTime.utc().minus({ days: 7 }).toISODate()!

  const seeded = {
    futurePending: null as InvoiceListItem | null,
    todayPending: null as InvoiceListItem | null,
    overduePending: null as InvoiceListItem | null,
    paidPastDue: null as InvoiceListItem | null,
    pagePending: [] as InvoiceListItem[],
    pageOverdue: [] as InvoiceListItem[],
  }

  group.tap((t) => t.timeout(30_000))

  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()

    const invoices = new InvoiceService()

    async function seedInvoice(planName: string, dueDate: string): Promise<InvoiceListItem> {
      const invoice = await invoices.createInvoice({
        organizationId,
        organizationName: 'Northstar Home Goods',
        organizationEmail: 'billing.bug018@example.com',
        planName,
        billingPeriod: 'monthly',
        periodStart: DateTime.fromISO(utcLastWeek, { zone: 'utc' }),
        periodEnd: DateTime.fromISO(utcTomorrow, { zone: 'utc' }),
        issueDate: DateTime.fromISO(utcLastWeek, { zone: 'utc' }),
        dueDate: DateTime.fromISO(dueDate, { zone: 'utc' }),
        currency: 'INR',
        taxRate: 0.18,
        discount: 0,
        notes: needle,
        lineItems: [
          {
            description: planName,
            detail: 'BUG-018 fixture',
            quantity: 1,
            unitPrice: 1000,
            amount: 1000,
          },
        ],
      })

      createdInvoices.push({ id: invoice.id, organizationId })

      await runWithTenant(organizationId, async () => {
        await db.from('invoices').where('id', invoice.id).update({ dueDate })
      })

      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        dueDate,
        planName,
      }
    }

    seeded.futurePending = await seedInvoice(`${needle} Future`, utcTomorrow)
    seeded.todayPending = await seedInvoice(`${needle} Today`, utcToday)
    seeded.overduePending = await seedInvoice(`${needle} Overdue`, utcYesterday)

    const paid = await seedInvoice(`${needle} Paid`, utcYesterday)
    await invoices.markInvoicePaid(paid.id, { paymentMethod: 'Manual' })
    seeded.paidPastDue = paid

    for (let index = 0; index < 3; index++) {
      seeded.pagePending.push(await seedInvoice(`${pageNeedle} Pending ${index + 1}`, utcTomorrow))
    }
    for (let index = 0; index < 2; index++) {
      seeded.pageOverdue.push(await seedInvoice(`${pageNeedle} Overdue ${index + 1}`, utcYesterday))
    }
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

  test('pending with future dueDate appears in Pending and not Overdue', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const pending = await client
      .get('/api/v1/super-admin/invoices')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: `${needle} Future`, status: 'pending', perPage: 20 })

    pending.assertStatus(200)
    assertListEnvelope(assert, pending.body(), { paginated: true })
    const pendingList = unwrapList(pending.body())
    assert.equal(pendingList.meta!.total, 1)
    assert.equal(pendingList.items.length, 1)
    assert.equal(pendingList.items[0]!.id, seeded.futurePending!.id)
    assert.equal(pendingList.items[0]!.status, 'pending')

    const overdue = await client
      .get('/api/v1/super-admin/invoices')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: `${needle} Future`, status: 'overdue', perPage: 20 })
    overdue.assertStatus(200)
    const overdueList = unwrapList(overdue.body())
    assert.equal(overdueList.meta!.total, 0)
    assert.equal(overdueList.items.length, 0)
  })

  test("pending with today's dueDate appears in Pending according to UTC date semantics", async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const pending = await client
      .get('/api/v1/super-admin/invoices')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: `${needle} Today`, status: 'pending', perPage: 20 })

    pending.assertStatus(200)
    const pendingList = unwrapList(pending.body())
    assert.equal(pendingList.meta!.total, 1)
    assert.equal(pendingList.items[0]!.id, seeded.todayPending!.id)
    assert.equal(pendingList.items[0]!.status, 'pending')

    const overdue = await client
      .get('/api/v1/super-admin/invoices')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: `${needle} Today`, status: 'overdue', perPage: 20 })
    overdue.assertStatus(200)
    assert.equal(unwrapList(overdue.body()).meta!.total, 0)
  })

  test('pending with past dueDate is excluded from Pending and included in Overdue', async ({
    client,
    assert,
  }) => {
    const stored = await runWithTenant(organizationId, async () => {
      return db
        .from('invoices')
        .where('id', seeded.overduePending!.id)
        .select('status', 'dueDate')
        .first()
    })
    assert.equal(stored?.status, 'pending')

    const token = await mintToken(DEMO_USERS.superadmin)
    const pending = await client
      .get('/api/v1/super-admin/invoices')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: `${needle} Overdue`, status: 'pending', perPage: 20 })
    pending.assertStatus(200)
    const pendingList = unwrapList(pending.body())
    assert.equal(pendingList.meta!.total, 0)
    assert.isFalse(pendingList.items.some((item) => item.id === seeded.overduePending!.id))

    const overdue = await client
      .get('/api/v1/super-admin/invoices')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: `${needle} Overdue`, status: 'overdue', perPage: 20 })
    overdue.assertStatus(200)
    const overdueList = unwrapList(overdue.body())
    assert.equal(overdueList.meta!.total, 1)
    assert.equal(overdueList.items[0]!.id, seeded.overduePending!.id)
    assert.equal(overdueList.items[0]!.status, 'overdue')
  })

  test('paid invoice does not appear in Pending or Overdue', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const pending = await client
      .get('/api/v1/super-admin/invoices')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: `${needle} Paid`, status: 'pending', perPage: 20 })
    pending.assertStatus(200)
    assert.equal(unwrapList(pending.body()).meta!.total, 0)

    const overdue = await client
      .get('/api/v1/super-admin/invoices')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: `${needle} Paid`, status: 'overdue', perPage: 20 })
    overdue.assertStatus(200)
    assert.equal(unwrapList(overdue.body()).meta!.total, 0)
  })

  test('search combined with Pending and Overdue still isolates the matching rows', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const pending = await client
      .get('/api/v1/super-admin/invoices')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: needle, status: 'pending', perPage: 100 })
    pending.assertStatus(200)
    const pendingList = unwrapList(pending.body())
    const pendingIds = pendingList.items.map((item) => item.id)

    assert.isTrue(pendingIds.includes(seeded.futurePending!.id))
    assert.isTrue(pendingIds.includes(seeded.todayPending!.id))
    assert.isFalse(pendingIds.includes(seeded.overduePending!.id))
    assert.isFalse(pendingIds.includes(seeded.paidPastDue!.id))
    assert.isTrue(pendingList.items.every((item) => item.status === 'pending'))

    const overdue = await client
      .get('/api/v1/super-admin/invoices')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: needle, status: 'overdue', perPage: 100 })
    overdue.assertStatus(200)
    const overdueList = unwrapList(overdue.body())
    const overdueIds = overdueList.items.map((item) => item.id)
    assert.isTrue(overdueIds.includes(seeded.overduePending!.id))
    assert.isFalse(overdueIds.includes(seeded.futurePending!.id))
    assert.isFalse(overdueIds.includes(seeded.todayPending!.id))
    assert.isFalse(overdueIds.includes(seeded.paidPastDue!.id))
    assert.isTrue(overdueList.items.every((item) => item.status === 'overdue'))
  })

  test('pagination meta.total reflects filtered pending rows, not unfiltered pending storage', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const page1 = await client
      .get('/api/v1/super-admin/invoices')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: pageNeedle, status: 'pending', page: 1, perPage: 2 })

    page1.assertStatus(200)
    const first = unwrapList(page1.body())
    assert.equal(first.meta!.total, 3)
    assert.equal(first.meta!.perPage, 2)
    assert.equal(first.meta!.currentPage, 1)
    assert.equal(first.meta!.lastPage, 2)
    assert.equal(first.items.length, 2)
    assert.isTrue(first.items.every((item) => item.status === 'pending'))
    const pagePendingIds = new Set(seeded.pagePending.map((row) => row.id))
    const pageOverdueIds = new Set(seeded.pageOverdue.map((row) => row.id))
    assert.isTrue(first.items.every((item) => pagePendingIds.has(item.id)))
    assert.isFalse(first.items.some((item) => pageOverdueIds.has(item.id)))

    const page2 = await client
      .get('/api/v1/super-admin/invoices')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: pageNeedle, status: 'pending', page: 2, perPage: 2 })
    page2.assertStatus(200)
    const second = unwrapList(page2.body())
    assert.equal(second.meta!.total, 3)
    assert.equal(second.meta!.currentPage, 2)
    assert.equal(second.items.length, 1)
    assert.isFalse(new Set(first.items.map((item) => item.id)).has(second.items[0]!.id))
    assert.isTrue(pagePendingIds.has(second.items[0]!.id))
  })

  test('empty Pending and Overdue filters return empty results', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const pending = await client
      .get('/api/v1/super-admin/invoices')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: emptyNeedle, status: 'pending', perPage: 20 })
    pending.assertStatus(200)
    const pendingList = unwrapList(pending.body())
    assert.equal(pendingList.meta!.total, 0)
    assert.deepEqual(pendingList.items, [])

    const overdue = await client
      .get('/api/v1/super-admin/invoices')
      .header('Authorization', `Bearer ${token}`)
      .qs({ search: emptyNeedle, status: 'overdue', perPage: 20 })
    overdue.assertStatus(200)
    const overdueList = unwrapList(overdue.body())
    assert.equal(overdueList.meta!.total, 0)
    assert.deepEqual(overdueList.items, [])
  })

  test('tenant user cannot list Super Admin invoices', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get('/api/v1/super-admin/invoices')
      .header('Authorization', `Bearer ${token}`)
      .qs({ status: 'pending' })
    response.assertStatus(403)
  })
})
