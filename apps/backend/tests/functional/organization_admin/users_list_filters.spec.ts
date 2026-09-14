import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { unwrapListEnvelope } from '#tests/helpers/list_envelope'

type OrgAdminUser = {
  id: string
  name: string
  email: string
  role: string
  memberId: string
}

type PaginationMeta = {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
}

function unwrapList(body: unknown): { items: OrgAdminUser[]; meta: PaginationMeta | null } {
  return unwrapListEnvelope<OrgAdminUser>(body)
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
    body: { payload: payload as Record<string, any> },
  })
  const token = (signed as { token?: string } | null)?.token
  if (!token) {
    throw new Error(`signJWT returned no token for ${email}`)
  }
  return token
}

test.group('Organization admin users list filters', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  test('unfiltered list is scoped to the active organization', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get('/api/v1/organization-admin/users?perPage=100')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta } = unwrapList(response.body())
    const ids = new Set(items.map((user) => user.id))

    assert.isAbove(items.length, 1)
    assert.isObject(meta)
    assert.equal(meta!.total, items.length)
    assert.isTrue(ids.has(FIXTURE_IDS.users.northstarOwner))
    assert.isTrue(ids.has(FIXTURE_IDS.users.northstarAgent))
    assert.isFalse(ids.has(FIXTURE_IDS.users.harborOwner))
    assert.isFalse(ids.has(FIXTURE_IDS.users.harborAgent))
    assert.isFalse(ids.has(FIXTURE_IDS.users.superadmin))
  })

  test('search finds a member who is not on the first page', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)

    const page1 = await client
      .get('/api/v1/organization-admin/users?page=1&perPage=1')
      .header('Authorization', `Bearer ${token}`)
    page1.assertStatus(200)
    const firstPage = unwrapList(page1.body())
    assert.equal(firstPage.items.length, 1)
    assert.isAbove(firstPage.meta!.total, 1)
    assert.isAbove(firstPage.meta!.lastPage, 1)

    const all = await client
      .get('/api/v1/organization-admin/users?perPage=100')
      .header('Authorization', `Bearer ${token}`)
    all.assertStatus(200)
    const offPage = unwrapList(all.body()).items.find((user) => user.id !== firstPage.items[0]!.id)
    assert.exists(offPage)

    const needle = offPage!.email
    const searched = await client
      .get(`/api/v1/organization-admin/users?search=${encodeURIComponent(needle)}&page=1&perPage=1`)
      .header('Authorization', `Bearer ${token}`)

    searched.assertStatus(200)
    const { items, meta } = unwrapList(searched.body())
    assert.equal(items.length, 1)
    assert.equal(items[0]!.id, offPage!.id)
    assert.equal(meta!.total, 1)
    assert.equal(meta!.currentPage, 1)
    assert.equal(meta!.perPage, 1)
    assert.equal(meta!.lastPage, 1)
  })

  test('role filter returns only members with that role', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get('/api/v1/organization-admin/users?role=agent&perPage=100')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta } = unwrapList(response.body())
    assert.isAbove(items.length, 0)
    assert.equal(meta!.total, items.length)
    assert.isTrue(items.every((user) => user.role === 'agent'))
    assert.isTrue(items.some((user) => user.id === FIXTURE_IDS.users.northstarAgent))
    assert.isFalse(items.some((user) => user.id === FIXTURE_IDS.users.northstarOwner))
    assert.isFalse(items.some((user) => user.id === FIXTURE_IDS.users.northstarSupport))
  })

  test('search and role filters apply together', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)

    const match = await client
      .get(
        `/api/v1/organization-admin/users?search=${encodeURIComponent('kavya')}&role=agent&perPage=100`
      )
      .header('Authorization', `Bearer ${token}`)
    match.assertStatus(200)
    const matched = unwrapList(match.body())
    assert.equal(matched.meta!.total, 1)
    assert.equal(matched.items.length, 1)
    assert.equal(matched.items[0]!.id, FIXTURE_IDS.users.northstarAgent)
    assert.equal(matched.items[0]!.role, 'agent')

    const miss = await client
      .get(
        `/api/v1/organization-admin/users?search=${encodeURIComponent('kavya')}&role=owner&perPage=100`
      )
      .header('Authorization', `Bearer ${token}`)
    miss.assertStatus(200)
    const missed = unwrapList(miss.body())
    assert.equal(missed.items.length, 0)
    assert.equal(missed.meta!.total, 0)
  })

  test('pagination metadata reflects the filtered result', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const query = `search=${encodeURIComponent('northstar')}&perPage=2`

    const page1 = await client
      .get(`/api/v1/organization-admin/users?${query}&page=1`)
      .header('Authorization', `Bearer ${token}`)
    const page2 = await client
      .get(`/api/v1/organization-admin/users?${query}&page=2`)
      .header('Authorization', `Bearer ${token}`)

    page1.assertStatus(200)
    page2.assertStatus(200)

    const first = unwrapList(page1.body())
    const second = unwrapList(page2.body())

    assert.isObject(first.meta)
    assert.equal(first.meta!.perPage, 2)
    assert.equal(first.meta!.currentPage, 1)
    assert.equal(second.meta!.currentPage, 2)
    assert.equal(first.meta!.total, second.meta!.total)
    assert.isAbove(first.meta!.total, 2)
    assert.equal(first.meta!.lastPage, Math.ceil(first.meta!.total / 2))
    assert.equal(first.items.length, 2)
    assert.isAbove(second.items.length, 0)

    const firstIds = new Set(first.items.map((user) => user.id))
    const secondIds = new Set(second.items.map((user) => user.id))
    for (const id of secondIds) {
      assert.isFalse(firstIds.has(id))
    }
    assert.isTrue(first.items.every((user) => user.email.toLowerCase().includes('northstar')))
    assert.isTrue(second.items.every((user) => user.email.toLowerCase().includes('northstar')))
  })

  test('search never returns members from another organization', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(`/api/v1/organization-admin/users?search=${encodeURIComponent('harbor')}&perPage=100`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta } = unwrapList(response.body())
    assert.equal(items.length, 0)
    assert.equal(meta!.total, 0)
    assert.isFalse(items.some((user) => user.id === FIXTURE_IDS.users.harborOwner))
    assert.isFalse(items.some((user) => user.id === FIXTURE_IDS.users.harborAgent))
  })

  test('other organization admin cannot see this organization via search or role', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.harborOwner, FIXTURE_IDS.orgs.harbor)
    const searched = await client
      .get(`/api/v1/organization-admin/users?search=${encodeURIComponent('kavya')}&perPage=100`)
      .header('Authorization', `Bearer ${token}`)
    searched.assertStatus(200)
    const searchedList = unwrapList(searched.body())
    assert.equal(searchedList.items.length, 0)
    assert.equal(searchedList.meta!.total, 0)
    assert.isFalse(searchedList.items.some((user) => user.id === FIXTURE_IDS.users.northstarAgent))

    const listed = await client
      .get('/api/v1/organization-admin/users?role=agent&perPage=100')
      .header('Authorization', `Bearer ${token}`)
    listed.assertStatus(200)
    const listedItems = unwrapList(listed.body()).items
    assert.isTrue(listedItems.every((user) => user.role === 'agent'))
    assert.isFalse(listedItems.some((user) => user.id === FIXTURE_IDS.users.northstarAgent))
    assert.isTrue(listedItems.some((user) => user.id === FIXTURE_IDS.users.harborAgent))
  })

  test('empty search and empty role filter return no rows and zero total', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(
        `/api/v1/organization-admin/users?search=${encodeURIComponent('zzznomatchxyz')}&role=viewer&perPage=20`
      )
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { items, meta } = unwrapList(response.body())
    assert.equal(items.length, 0)
    assert.equal(meta!.total, 0)
    assert.equal(meta!.currentPage, 1)
    assert.equal(meta!.perPage, 20)
  })

  test('non-admin members cannot list organization admin users', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.northstarAgent, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get('/api/v1/organization-admin/users?search=kavya&role=agent')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(403)
  })
})
