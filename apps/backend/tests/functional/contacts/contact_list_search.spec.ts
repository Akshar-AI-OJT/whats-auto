import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { runWithTenant } from '#services/tenant_context'

const ACTIVE_ORG_BY_EMAIL: Record<string, string> = {
  [DEMO_USERS.northstarOwner]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.harborOwner]: FIXTURE_IDS.orgs.harbor,
}

type ContactRow = {
  id: string
  organizationId: string
  phone: string
  phoneNormalized: string
  name: string | null
  email: string | null
  company: string | null
}

type PaginationMeta = {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
}

function unwrapList(body: unknown): { items: ContactRow[]; meta: PaginationMeta | null } {
  if (!body || typeof body !== 'object') return { items: [], meta: null }

  const root = body as {
    data?: ContactRow[] | { data?: ContactRow[]; meta?: PaginationMeta }
    meta?: PaginationMeta
    metadata?: PaginationMeta
  }

  const meta = root.meta ?? root.metadata ?? null

  if (Array.isArray(root.data)) {
    return { items: root.data, meta }
  }

  if (root.data && typeof root.data === 'object' && Array.isArray(root.data.data)) {
    return { items: root.data.data, meta: root.data.meta ?? meta }
  }

  return { items: [], meta: null }
}

function unwrapContact(body: unknown): ContactRow | null {
  if (!body || typeof body !== 'object') return null
  const root = body as { data?: ContactRow } & ContactRow
  if (root.data && typeof root.data === 'object' && typeof root.data.id === 'string') {
    return root.data
  }
  if (typeof root.id === 'string') return root
  return null
}

async function mintDemoToken(email: string): Promise<string> {
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

  const orgId = ACTIVE_ORG_BY_EMAIL[email]
  if (!orgId) throw new Error(`No active org mapping for ${email}`)
  await db.from('sessions').where('id', sessionRow.id).update({ activeOrganizationId: orgId })

  const payload = await new AccessTokenClaimsService().build({
    user: {
      id: result.user.id,
      email,
      name: result.user.name ?? email,
    },
    session: { id: sessionRow.id as string, activeOrganizationId: orgId },
  })

  const signed = await auth.api.signJWT({
    body: { payload: payload as Record<string, any> },
  })
  const token = (signed as { token?: string } | null)?.token
  if (!token) throw new Error(`signJWT returned no token for ${email}`)
  return token
}

function uniqueUsPhone(tag: string): string {
  const digits = `${tag}${randomUUID()}`.replace(/\D/g, '').slice(0, 4).padEnd(4, '0')
  return `+1415555${digits}`
}

test.group('Contacts list search and pagination', (group) => {
  const createdIds: string[] = []

  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.teardown(async () => {
    if (createdIds.length === 0) return
    await runWithTenant(FIXTURE_IDS.orgs.northstar, async () => {
      await db.from('contacts').whereIn('id', createdIds).delete()
    })
  })

  test('empty search returns live org contacts with pagination meta', async ({
    client,
    assert,
  }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get('/api/v1/contacts?page=1&perPage=100')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta } = unwrapList(response.body())
    const ids = new Set(items.map((row) => row.id))

    assert.isObject(meta)
    assert.equal(meta!.currentPage, 1)
    assert.equal(meta!.perPage, 100)
    assert.equal(meta!.total, items.length)
    assert.isAtLeast(meta!.lastPage, 1)
    assert.isTrue(ids.has(FIXTURE_IDS.contacts.northstarPriya))
    assert.isFalse(ids.has(FIXTURE_IDS.contacts.northstarDeleted))
    assert.isFalse(ids.has(FIXTURE_IDS.contacts.harborJordan))
    assert.isTrue(items.every((row) => row.organizationId === FIXTURE_IDS.orgs.northstar))
  })

  test('default list is paginated', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client.get('/api/v1/contacts').header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta } = unwrapList(response.body())
    assert.isObject(meta)
    assert.equal(meta!.currentPage, 1)
    assert.equal(meta!.perPage, 20)
    assert.isAtMost(items.length, 20)
    assert.equal(meta!.lastPage, Math.ceil(meta!.total / meta!.perPage) || 1)
  })

  test('search matches name, email, company, and phone fields', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)

    const byName = await client
      .get(`/api/v1/contacts?search=${encodeURIComponent('Priya Kapoor')}&perPage=100`)
      .header('Authorization', `Bearer ${token}`)
    byName.assertStatus(200)
    const nameResult = unwrapList(byName.body())
    assert.isTrue(nameResult.items.some((row) => row.id === FIXTURE_IDS.contacts.northstarPriya))
    assert.equal(nameResult.meta!.total, nameResult.items.length)

    const byEmail = await client
      .get(`/api/v1/contacts?search=${encodeURIComponent('priya.kapoor@example.com')}&perPage=100`)
      .header('Authorization', `Bearer ${token}`)
    byEmail.assertStatus(200)
    assert.isTrue(
      unwrapList(byEmail.body()).items.some((row) => row.id === FIXTURE_IDS.contacts.northstarPriya)
    )

    const byCompany = await client
      .get(`/api/v1/contacts?search=${encodeURIComponent('Kapoor Interiors')}&perPage=100`)
      .header('Authorization', `Bearer ${token}`)
    byCompany.assertStatus(200)
    assert.isTrue(
      unwrapList(byCompany.body()).items.some(
        (row) => row.id === FIXTURE_IDS.contacts.northstarPriya
      )
    )

    const byPhone = await client
      .get('/api/v1/contacts?search=9811122233&perPage=100')
      .header('Authorization', `Bearer ${token}`)
    byPhone.assertStatus(200)
    assert.isTrue(
      unwrapList(byPhone.body()).items.some((row) => row.id === FIXTURE_IDS.contacts.northstarPriya)
    )
  })

  test('search is case-insensitive', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get(`/api/v1/contacts?search=${encodeURIComponent('PRIYA kapoor')}&perPage=100`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta } = unwrapList(response.body())
    assert.isTrue(items.some((row) => row.id === FIXTURE_IDS.contacts.northstarPriya))
    assert.isAtLeast(meta!.total, 1)
  })

  test('search finds a contact that is not on the first page and reports filtered meta.total', async ({
    client,
    assert,
  }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const needleName = `Bug010NeedleUnique ${randomUUID().slice(0, 8)}`

    const needle = await client
      .post('/api/v1/contacts')
      .header('Authorization', `Bearer ${token}`)
      .json({ phoneNumber: uniqueUsPhone('n'), name: needleName })
    needle.assertStatus(200)
    const needleId = unwrapContact(needle.body())!.id
    createdIds.push(needleId)

    for (let i = 0; i < 4; i++) {
      const filler = await client
        .post('/api/v1/contacts')
        .header('Authorization', `Bearer ${token}`)
        .json({ phoneNumber: uniqueUsPhone(`f${i}`), name: `Bug010Filler ${i}` })
      filler.assertStatus(200)
      createdIds.push(unwrapContact(filler.body())!.id)
    }

    const page1 = await client
      .get('/api/v1/contacts?page=1&perPage=2')
      .header('Authorization', `Bearer ${token}`)
    page1.assertStatus(200)
    const firstPage = unwrapList(page1.body())
    assert.equal(firstPage.items.length, 2)
    assert.isFalse(firstPage.items.some((row) => row.id === needleId))
    assert.isAbove(firstPage.meta!.total, 2)
    assert.isAbove(firstPage.meta!.lastPage, 1)
    assert.equal(firstPage.meta!.currentPage, 1)
    assert.equal(firstPage.meta!.perPage, 2)

    const searched = await client
      .get(`/api/v1/contacts?search=${encodeURIComponent(needleName)}&page=1&perPage=2`)
      .header('Authorization', `Bearer ${token}`)
    searched.assertStatus(200)
    const { items, meta } = unwrapList(searched.body())
    assert.equal(items.length, 1)
    assert.equal(items[0]!.id, needleId)
    assert.equal(meta!.total, 1)
    assert.equal(meta!.currentPage, 1)
    assert.equal(meta!.perPage, 2)
    assert.equal(meta!.lastPage, 1)
  })

  test('nonexistent search returns empty data and meta.total 0', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get('/api/v1/contacts?search=zzz-bug010-no-such-contact&perPage=20')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta } = unwrapList(response.body())
    assert.equal(items.length, 0)
    assert.equal(meta!.total, 0)
    assert.equal(meta!.currentPage, 1)
    assert.equal(meta!.perPage, 20)
    assert.equal(meta!.lastPage, 1)
  })

  test('search is isolated to the active organization', async ({ client, assert }) => {
    const harborToken = await mintDemoToken(DEMO_USERS.harborOwner)
    const priyaSearch = await client
      .get(`/api/v1/contacts?search=${encodeURIComponent('Priya Kapoor')}&perPage=100`)
      .header('Authorization', `Bearer ${harborToken}`)

    priyaSearch.assertStatus(200)
    const priyaResult = unwrapList(priyaSearch.body())
    assert.isFalse(priyaResult.items.some((row) => row.id === FIXTURE_IDS.contacts.northstarPriya))
    assert.equal(priyaResult.meta!.total, priyaResult.items.length)

    const jordanSearch = await client
      .get(`/api/v1/contacts?search=${encodeURIComponent('Jordan Ellis')}&perPage=100`)
      .header('Authorization', `Bearer ${harborToken}`)
    jordanSearch.assertStatus(200)
    const jordanResult = unwrapList(jordanSearch.body())
    assert.isTrue(jordanResult.items.some((row) => row.id === FIXTURE_IDS.contacts.harborJordan))
    assert.isTrue(jordanResult.items.every((row) => row.organizationId === FIXTURE_IDS.orgs.harbor))
  })

  test('soft-deleted contacts are not returned by list or search', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const listed = await client
      .get('/api/v1/contacts?perPage=100')
      .header('Authorization', `Bearer ${token}`)
    listed.assertStatus(200)
    assert.isFalse(
      unwrapList(listed.body()).items.some(
        (row) => row.id === FIXTURE_IDS.contacts.northstarDeleted
      )
    )

    const searched = await client
      .get(`/api/v1/contacts?search=${encodeURIComponent('Archived Contact')}&perPage=100`)
      .header('Authorization', `Bearer ${token}`)
    searched.assertStatus(200)
    assert.isFalse(
      unwrapList(searched.body()).items.some(
        (row) => row.id === FIXTURE_IDS.contacts.northstarDeleted
      )
    )
  })

  test('create list update and delete still work with paginated list', async ({
    client,
    assert,
  }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const name = `Bug010Lifecycle ${randomUUID().slice(0, 8)}`
    const created = await client
      .post('/api/v1/contacts')
      .header('Authorization', `Bearer ${token}`)
      .json({ phoneNumber: uniqueUsPhone('g'), name })
    created.assertStatus(200)
    const id = unwrapContact(created.body())!.id
    createdIds.push(id)

    const listed = await client
      .get(`/api/v1/contacts?search=${encodeURIComponent(name)}&perPage=20`)
      .header('Authorization', `Bearer ${token}`)
    listed.assertStatus(200)
    assert.isTrue(unwrapList(listed.body()).items.some((row) => row.id === id))

    const renamed = await client
      .patch(`/api/v1/contacts/${id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: `${name} Updated` })
    renamed.assertStatus(200)
    assert.equal(unwrapContact(renamed.body())!.name, `${name} Updated`)

    const deleted = await client
      .delete(`/api/v1/contacts/${id}`)
      .header('Authorization', `Bearer ${token}`)
    deleted.assertStatus(200)

    const after = await client
      .get(`/api/v1/contacts?search=${encodeURIComponent(name)}&perPage=20`)
      .header('Authorization', `Bearer ${token}`)
    after.assertStatus(200)
    assert.isFalse(unwrapList(after.body()).items.some((row) => row.id === id))
  })
})
