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
  [DEMO_USERS.northstarAdmin]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarAgent]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarViewer]: FIXTURE_IDS.orgs.northstar,
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

function unwrapContact(body: unknown): ContactRow | null {
  if (!body || typeof body !== 'object') return null
  const root = body as { data?: ContactRow } & ContactRow
  if (root.data && typeof root.data === 'object' && typeof root.data.id === 'string') {
    return root.data
  }
  if (typeof root.id === 'string') return root
  return null
}

function errorBody(response: { body: () => unknown }): { code?: string; error?: string } {
  return response.body() as { code?: string; error?: string }
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

function uniqueInNational(): string {
  const digits = randomUUID().replace(/\D/g, '').slice(0, 8).padEnd(8, '1')
  return `98${digits}`
}

function unwrapList(body: unknown): ContactRow[] {
  if (Array.isArray(body)) return body as ContactRow[]
  if (body && typeof body === 'object' && Array.isArray((body as { data?: ContactRow[] }).data)) {
    return (body as { data: ContactRow[] }).data
  }
  return []
}

test.group('Contacts GET-by-id and PATCH', (group) => {
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

  test('owner can get an existing contact by id', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get(`/api/v1/contacts/${FIXTURE_IDS.contacts.northstarPriya}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const contact = unwrapContact(response.body())
    assert.exists(contact)
    assert.equal(contact!.id, FIXTURE_IDS.contacts.northstarPriya)
    assert.equal(contact!.organizationId, FIXTURE_IDS.orgs.northstar)
    assert.equal(contact!.name, 'Priya Kapoor')
    assert.notEqual(contact!.id, FIXTURE_IDS.contacts.harborJordan)
  })

  test('returns 404 for a nonexistent contact', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get(`/api/v1/contacts/${randomUUID()}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(404)
    assert.equal(errorBody(response).code, 'E_CONTACT_NOT_FOUND')
  })

  test('returns 404 for a soft-deleted contact', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get(`/api/v1/contacts/${FIXTURE_IDS.contacts.northstarDeleted}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(404)
    assert.equal(errorBody(response).code, 'E_CONTACT_NOT_FOUND')
  })

  test('cannot get another organization contact (IDOR)', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const response = await client
      .get(`/api/v1/contacts/${FIXTURE_IDS.contacts.harborJordan}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(404)
    assert.equal(errorBody(response).code, 'E_CONTACT_NOT_FOUND')
    assert.isNull(unwrapContact(response.body()))
  })

  test('rejects unauthenticated GET and PATCH', async ({ client }) => {
    const get = await client.get(`/api/v1/contacts/${FIXTURE_IDS.contacts.northstarPriya}`)
    get.assertStatus(401)

    const patch = await client
      .patch(`/api/v1/contacts/${FIXTURE_IDS.contacts.northstarPriya}`)
      .json({ name: 'Blocked' })
    patch.assertStatus(401)
  })

  test('viewer can get but cannot patch a contact', async ({ client }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarViewer)
    const shown = await client
      .get(`/api/v1/contacts/${FIXTURE_IDS.contacts.northstarPriya}`)
      .header('Authorization', `Bearer ${token}`)
    shown.assertStatus(200)

    const patched = await client
      .patch(`/api/v1/contacts/${FIXTURE_IDS.contacts.northstarPriya}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Viewer Edit' })
    patched.assertStatus(403)
  })

  test('agent cannot patch a contact', async ({ client }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarAgent)
    const patched = await client
      .patch(`/api/v1/contacts/${FIXTURE_IDS.contacts.northstarPriya}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Agent Edit' })
    patched.assertStatus(403)
  })

  test('owner can update profile fields', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const created = await client
      .post('/api/v1/contacts')
      .header('Authorization', `Bearer ${token}`)
      .json({
        phoneNumber: uniqueUsPhone('a'),
        name: 'Before',
        email: 'before@example.com',
        company: 'Old Co',
      })
    created.assertStatus(200)
    const original = unwrapContact(created.body())!
    createdIds.push(original.id)

    const patched = await client
      .patch(`/api/v1/contacts/${original.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        name: 'After Lovelace',
        email: 'after@example.com',
        company: 'New Co',
      })
    patched.assertStatus(200)
    const updated = unwrapContact(patched.body())
    assert.exists(updated)
    assert.equal(updated!.id, original.id)
    assert.equal(updated!.name, 'After Lovelace')
    assert.equal(updated!.email, 'after@example.com')
    assert.equal(updated!.company, 'New Co')
    assert.equal(updated!.phoneNormalized, original.phoneNormalized)
    assert.equal(updated!.organizationId, FIXTURE_IDS.orgs.northstar)
  })

  test('normalizes a national phone on update', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const created = await client
      .post('/api/v1/contacts')
      .header('Authorization', `Bearer ${token}`)
      .json({ phoneNumber: uniqueUsPhone('b'), name: 'Norm' })
    created.assertStatus(200)
    const original = unwrapContact(created.body())!
    createdIds.push(original.id)

    const national = uniqueInNational()
    const patched = await client
      .patch(`/api/v1/contacts/${original.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ phoneNumber: national, countryCode: 'IN' })
    patched.assertStatus(200)
    const updated = unwrapContact(patched.body())
    assert.equal(updated!.phone, national)
    assert.equal(updated!.phoneNormalized, `91${national}`)
  })

  test('rejects an invalid email on update', async ({ client }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const created = await client
      .post('/api/v1/contacts')
      .header('Authorization', `Bearer ${token}`)
      .json({ phoneNumber: uniqueUsPhone('c'), name: 'Email' })
    created.assertStatus(200)
    createdIds.push(unwrapContact(created.body())!.id)

    const patched = await client
      .patch(`/api/v1/contacts/${unwrapContact(created.body())!.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ email: 'not-an-email' })
    patched.assertStatus(422)
  })

  test('rejects an invalid phone on update', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const created = await client
      .post('/api/v1/contacts')
      .header('Authorization', `Bearer ${token}`)
      .json({ phoneNumber: uniqueUsPhone('d') })
    created.assertStatus(200)
    createdIds.push(unwrapContact(created.body())!.id)

    const patched = await client
      .patch(`/api/v1/contacts/${unwrapContact(created.body())!.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ phoneNumber: '12' })
    patched.assertStatus(422)
    assert.equal(errorBody(patched).code, 'E_CONTACT_PHONE_INVALID')
  })

  test('rejects a duplicate phone on update', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const first = await client
      .post('/api/v1/contacts')
      .header('Authorization', `Bearer ${token}`)
      .json({ phoneNumber: uniqueUsPhone('e'), name: 'First' })
    first.assertStatus(200)
    const second = await client
      .post('/api/v1/contacts')
      .header('Authorization', `Bearer ${token}`)
      .json({ phoneNumber: uniqueUsPhone('f'), name: 'Second' })
    second.assertStatus(200)
    const firstId = unwrapContact(first.body())!.id
    const secondContact = unwrapContact(second.body())!
    createdIds.push(firstId, secondContact.id)

    const patched = await client
      .patch(`/api/v1/contacts/${firstId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ phoneNumber: secondContact.phone })
    patched.assertStatus(409)
    assert.equal(errorBody(patched).code, 'E_CONTACT_PHONE_EXISTS')
  })

  test('cannot patch another organization contact (IDOR)', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const patched = await client
      .patch(`/api/v1/contacts/${FIXTURE_IDS.contacts.harborJordan}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Hijacked' })
    patched.assertStatus(404)
    assert.equal(errorBody(patched).code, 'E_CONTACT_NOT_FOUND')
    assert.isNull(unwrapContact(patched.body()))
  })

  test('patching a nonexistent contact returns 404', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const patched = await client
      .patch(`/api/v1/contacts/${randomUUID()}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Missing' })
    patched.assertStatus(404)
    assert.equal(errorBody(patched).code, 'E_CONTACT_NOT_FOUND')
  })

  test('create list and delete still work alongside update', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const created = await client
      .post('/api/v1/contacts')
      .header('Authorization', `Bearer ${token}`)
      .json({ phoneNumber: uniqueUsPhone('g'), name: 'Lifecycle' })
    created.assertStatus(200)
    const id = unwrapContact(created.body())!.id

    const listed = await client.get('/api/v1/contacts').header('Authorization', `Bearer ${token}`)
    listed.assertStatus(200)
    const items = unwrapList(listed.body())
    assert.isTrue(items.some((row) => row.id === id))

    const renamed = await client
      .patch(`/api/v1/contacts/${id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Lifecycle Updated' })
    renamed.assertStatus(200)
    assert.equal(unwrapContact(renamed.body())!.name, 'Lifecycle Updated')

    const deleted = await client
      .delete(`/api/v1/contacts/${id}`)
      .header('Authorization', `Bearer ${token}`)
    deleted.assertStatus(200)

    const after = await client.get('/api/v1/contacts').header('Authorization', `Bearer ${token}`)
    const remaining = unwrapList(after.body())
    assert.isFalse(remaining.some((row) => row.id === id))
  })
})
