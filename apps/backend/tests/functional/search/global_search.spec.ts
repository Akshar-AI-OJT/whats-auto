import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { runWithTenant } from '#services/tenant_context'

type SearchResult = {
  type: string
  id: string
  title: string
  description: string | null
}

type SearchPayload = {
  query: string
  results: SearchResult[]
}

const ACTIVE_ORG_BY_EMAIL: Record<string, string> = {
  [DEMO_USERS.northstarOwner]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.harborOwner]: FIXTURE_IDS.orgs.harbor,
}

function unwrapSearch(body: unknown): SearchPayload {
  if (!body || typeof body !== 'object') {
    return { query: '', results: [] }
  }

  const root = body as { data?: SearchPayload; query?: string; results?: SearchResult[] }
  if (root.data && Array.isArray(root.data.results)) {
    return { query: root.data.query, results: root.data.results }
  }
  if (Array.isArray(root.results)) {
    return { query: root.query ?? '', results: root.results }
  }
  return { query: '', results: [] }
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

  const orgId = activeOrgId ?? ACTIVE_ORG_BY_EMAIL[email]
  if (orgId) {
    await db.from('sessions').where('id', sessionRow.id).update({ activeOrganizationId: orgId })
  }

  const payload = await new AccessTokenClaimsService().build({
    user: {
      id: result.user.id,
      email,
      name: result.user.name ?? email,
    },
    session: { id: sessionRow.id as string, activeOrganizationId: orgId ?? null },
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

test.group('Global Search HTTP', (group) => {
  const extraContactIds: string[] = []
  const extraCampaignIds: string[] = []

  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()

    const northstarContactId = randomUUID()
    extraContactIds.push(northstarContactId)
    await runWithTenant(FIXTURE_IDS.orgs.northstar, async () => {
      await db.table('contacts').insert({
        id: northstarContactId,
        organizationId: FIXTURE_IDS.orgs.northstar,
        phone: '919800011122',
        phoneNormalized: '919800011122',
        name: 'Abc Search Target',
        email: 'abc.search@example.com',
        company: 'Abc Northstar',
        customFields: {},
        createdByUserId: FIXTURE_IDS.users.northstarOwner,
        createdAt: new Date(),
      })
    })

    const harborContactId = randomUUID()
    extraContactIds.push(harborContactId)
    await runWithTenant(FIXTURE_IDS.orgs.harbor, async () => {
      await db.table('contacts').insert({
        id: harborContactId,
        organizationId: FIXTURE_IDS.orgs.harbor,
        phone: '+12125550111',
        phoneNormalized: '12125550111',
        name: 'Abc Harbor Only',
        email: 'abc.harbor@example.com',
        company: 'Harbor Abc',
        customFields: {},
        createdByUserId: FIXTURE_IDS.users.harborOwner,
        createdAt: new Date(),
      })
    })

    const campaignId = randomUUID()
    extraCampaignIds.push(campaignId)
    await runWithTenant(FIXTURE_IDS.orgs.northstar, async () => {
      await db.table('broadcasts').insert({
        id: campaignId,
        organizationId: FIXTURE_IDS.orgs.northstar,
        createdByUserId: FIXTURE_IDS.users.northstarOwner,
        name: 'Abc Growth Campaign',
        status: 'draft',
        totalRecipients: 0,
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
        repliedCount: 0,
        failedCount: 0,
        createdAt: new Date(),
      })
    })
  })

  group.teardown(async () => {
    await runWithTenant(FIXTURE_IDS.orgs.northstar, async () => {
      if (extraCampaignIds.length) {
        await db.from('broadcasts').whereIn('id', extraCampaignIds).delete()
      }
      if (extraContactIds.length) {
        await db.from('contacts').whereIn('id', extraContactIds).delete()
      }
    })
    await runWithTenant(FIXTURE_IDS.orgs.harbor, async () => {
      if (extraContactIds.length) {
        await db.from('contacts').whereIn('id', extraContactIds).delete()
      }
    })
  })

  test('organization user search returns matching records from own organization', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get(`/api/v1/search?q=${encodeURIComponent('abc')}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const payload = unwrapSearch(response.body())
    assert.equal(payload.query, 'abc')
    assert.isAbove(payload.results.length, 0)
    assert.isTrue(
      payload.results.some((item) => item.type === 'contact' && item.title === 'Abc Search Target')
    )
    assert.isTrue(
      payload.results.some(
        (item) => item.type === 'campaign' && item.title === 'Abc Growth Campaign'
      )
    )
    assert.isFalse(payload.results.some((item) => item.title === 'Abc Harbor Only'))
  })

  test('organization search never returns another tenant’s matching records', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get(`/api/v1/search?q=${encodeURIComponent('Jordan')}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const payload = unwrapSearch(response.body())
    assert.isFalse(payload.results.some((item) => /jordan/i.test(item.title)))
    assert.isFalse(payload.results.some((item) => item.id === FIXTURE_IDS.contacts.harborJordan))
  })

  test('client-supplied organizationId does not change tenant search scope', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get(
        `/api/v1/search?q=${encodeURIComponent('Abc Harbor Only')}&organizationId=${FIXTURE_IDS.orgs.harbor}`
      )
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const payload = unwrapSearch(response.body())
    assert.isFalse(payload.results.some((item) => item.title === 'Abc Harbor Only'))
  })

  test('partial and case-insensitive search finds the same organization record', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.northstarOwner)
    const queries = ['growth', 'GROWTH', 'Grow']

    for (const q of queries) {
      const response = await client
        .get(`/api/v1/search?q=${encodeURIComponent(q)}`)
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(200)
      const payload = unwrapSearch(response.body())
      assert.isTrue(
        payload.results.some((item) => item.type === 'campaign' && /growth/i.test(item.title)),
        `expected campaign match for ${q}`
      )
    }
  })

  test('valid search with no matches returns empty results', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get(`/api/v1/search?q=${encodeURIComponent('zzzxxyynomatch999')}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const payload = unwrapSearch(response.body())
    assert.equal(payload.query, 'zzzxxyynomatch999')
    assert.lengthOf(payload.results, 0)
  })

  test('empty query is rejected', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get('/api/v1/search?q=')
      .header('Authorization', `Bearer ${token}`)
    response.assertStatus(422)
  })

  test('unauthenticated search is rejected', async ({ client }) => {
    const response = await client.get('/api/v1/search?q=abc')
    response.assertStatus(401)
  })

  test('organization user cannot access Super Admin search', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get(`/api/v1/super-admin/search?q=${encodeURIComponent('abc')}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(403)
    const body = response.body() as { code?: string }
    assert.equal(body.code, 'PLATFORM_ACCESS_DENIED')
  })

  test('super admin search returns authorized platform records', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(`/api/v1/super-admin/search?q=${encodeURIComponent('abc')}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const payload = unwrapSearch(response.body())
    assert.equal(payload.query, 'abc')
    const platformTypes = new Set(['organization', 'user', 'plan', 'subscription', 'invoice'])
    for (const item of payload.results) {
      assert.isTrue(platformTypes.has(item.type), `unexpected tenant type ${item.type}`)
    }
    assert.isFalse(payload.results.some((item) => item.type === 'contact'))
    assert.isFalse(payload.results.some((item) => item.type === 'campaign'))
  })

  test('super admin search finds organizations, users, and plans', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(`/api/v1/super-admin/search?q=${encodeURIComponent('northstar')}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const payload = unwrapSearch(response.body())
    assert.isTrue(
      payload.results.some(
        (item) => item.type === 'organization' && item.id === FIXTURE_IDS.orgs.northstar
      )
    )
    assert.isTrue(
      payload.results.some(
        (item) => item.type === 'user' && /northstar/i.test(item.description ?? '')
      )
    )
  })

  test('super admin partial and case-insensitive plan search', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const queries = ['growth', 'GROWTH', 'Grow']

    for (const q of queries) {
      const response = await client
        .get(`/api/v1/super-admin/search?q=${encodeURIComponent(q)}`)
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(200)
      const payload = unwrapSearch(response.body())
      assert.isTrue(
        payload.results.some((item) => item.type === 'plan' && /growth/i.test(item.title)),
        `expected Growth plan for ${q}`
      )
    }
  })

  test('super admin empty query is rejected', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get('/api/v1/super-admin/search?q=')
      .header('Authorization', `Bearer ${token}`)
    response.assertStatus(422)
  })

  test('super admin search with no matches returns empty results', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(`/api/v1/super-admin/search?q=${encodeURIComponent('zzzxxyynomatch999')}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const payload = unwrapSearch(response.body())
    assert.lengthOf(payload.results, 0)
  })
})
