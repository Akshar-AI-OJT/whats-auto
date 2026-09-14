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

function errorBody(response: { body: () => unknown }): { code?: string; error?: string } {
  return response.body() as { code?: string; error?: string }
}

async function mintDemoToken(email: string): Promise<string> {
  let result: { token?: string; user?: { id: string; name: string; email: string } }
  try {
    result = (await auth.api.signInEmail({
      body: { email, password: DEMO_PASSWORD },
    })) as { token?: string; user?: { id: string; name: string; email: string } }
  } catch (error) {
    throw new Error(
      `Failed to sign in ${email}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }

  if (!result.token || !result.user?.id) {
    throw new Error(`Failed to sign in ${email}: ${JSON.stringify(result)}`)
  }

  const sessionRow = await db.from('sessions').where('token', result.token).select('id').first()
  if (!sessionRow?.id) {
    throw new Error(`No session row after sign-in for ${email}`)
  }

  const orgId = ACTIVE_ORG_BY_EMAIL[email]
  if (!orgId) {
    throw new Error(`No active org mapping for ${email}`)
  }
  await db.from('sessions').where('id', sessionRow.id).update({ activeOrganizationId: orgId })

  const payload = await new AccessTokenClaimsService().build({
    user: {
      id: result.user.id,
      email,
      name: result.user.name ?? email,
    },
    session: { id: sessionRow.id as string, activeOrganizationId: orgId },
  })

  try {
    const signed = await auth.api.signJWT({
      body: { payload: payload as Record<string, any> },
    })
    const token = (signed as { token?: string } | null)?.token
    if (!token) {
      throw new Error(`signJWT returned no token for ${email}: ${JSON.stringify(signed)}`)
    }
    return token
  } catch (error) {
    throw new Error(
      `Failed to mint token for ${email}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
}

test.group('Tags HTTP', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.teardown(async () => {
    for (const organizationId of [FIXTURE_IDS.orgs.northstar, FIXTURE_IDS.orgs.harbor]) {
      await runWithTenant(organizationId, async () => {
        await db.from('contact_tags').where('organizationId', organizationId).delete()
        await db.from('tags').where('organizationId', organizationId).delete()
      })
    }
  })

  test('rejects unauthenticated list', async ({ client }) => {
    const response = await client.get('/api/v1/tags')
    response.assertStatus(401)
  })

  test('viewer can list but cannot create tags', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarViewer)

    const list = await client.get('/api/v1/tags').header('Authorization', `Bearer ${token}`)
    list.assertStatus(200)
    assert.isArray(list.body().data)

    const create = await client
      .post('/api/v1/tags')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Blocked' })
    create.assertStatus(403)
  })

  test('agent cannot assign or delete tags', async ({ client }) => {
    const owner = await mintDemoToken(DEMO_USERS.northstarOwner)
    const created = await client
      .post('/api/v1/tags')
      .header('Authorization', `Bearer ${owner}`)
      .json({ name: `AgentGate-${Date.now()}` })
    created.assertStatus(200)
    const tagId = created.body().data.id as string

    const agent = await mintDemoToken(DEMO_USERS.northstarAgent)
    const assign = await client
      .post(`/api/v1/tags/${tagId}/contacts`)
      .header('Authorization', `Bearer ${agent}`)
      .json({ contactId: FIXTURE_IDS.contacts.northstarPriya })
    assign.assertStatus(403)

    const destroy = await client
      .delete(`/api/v1/tags/${tagId}`)
      .header('Authorization', `Bearer ${agent}`)
    destroy.assertStatus(403)
  })

  test('owner can CRUD a tag and assign/remove a contact', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const name = `VIP-${Date.now()}`

    const created = await client
      .post('/api/v1/tags')
      .header('Authorization', `Bearer ${token}`)
      .json({ name, color: '#22C55E' })
    created.assertStatus(200)
    const tag = created.body().data
    assert.equal(tag.name, name)
    assert.equal(tag.color, '#22C55E')
    assert.equal(tag.contactCount, 0)
    assert.equal(tag.usedInCampaigns, 0)
    assert.equal(tag.organizationId, FIXTURE_IDS.orgs.northstar)
    assert.isNull(tag.description)
    assert.equal(tag.status, 'active')

    const listed = await client.get('/api/v1/tags').header('Authorization', `Bearer ${token}`)
    listed.assertStatus(200)
    assert.isTrue((listed.body().data as { id: string }[]).some((row) => row.id === tag.id))

    const shown = await client
      .get(`/api/v1/tags/${tag.id}`)
      .header('Authorization', `Bearer ${token}`)
    shown.assertStatus(200)
    assert.equal(shown.body().data.id, tag.id)

    const patched = await client
      .patch(`/api/v1/tags/${tag.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: `${name}-2`, color: '#000000' })
    patched.assertStatus(200)
    assert.equal(patched.body().data.name, `${name}-2`)
    assert.equal(patched.body().data.color, '#000000')

    const assigned = await client
      .post(`/api/v1/tags/${tag.id}/contacts`)
      .header('Authorization', `Bearer ${token}`)
      .json({ contactId: FIXTURE_IDS.contacts.northstarPriya })
    assigned.assertStatus(200)
    assert.equal(assigned.body().data.tagId, tag.id)
    assert.equal(assigned.body().data.contactId, FIXTURE_IDS.contacts.northstarPriya)
    assert.equal(assigned.body().data.organizationId, FIXTURE_IDS.orgs.northstar)

    const duplicate = await client
      .post(`/api/v1/tags/${tag.id}/contacts`)
      .header('Authorization', `Bearer ${token}`)
      .json({ contactId: FIXTURE_IDS.contacts.northstarPriya })
    duplicate.assertStatus(409)
    assert.equal(errorBody(duplicate).code, 'E_TAG_ASSIGNMENT_EXISTS')

    const members = await client
      .get(`/api/v1/tags/${tag.id}/contacts`)
      .header('Authorization', `Bearer ${token}`)
    members.assertStatus(200)
    assert.lengthOf(members.body().data, 1)
    assert.equal(members.body().data[0].id, FIXTURE_IDS.contacts.northstarPriya)

    const counted = await client
      .get(`/api/v1/tags/${tag.id}`)
      .header('Authorization', `Bearer ${token}`)
    assert.equal(counted.body().data.contactCount, 1)

    const removed = await client
      .delete(`/api/v1/tags/${tag.id}/contacts/${FIXTURE_IDS.contacts.northstarPriya}`)
      .header('Authorization', `Bearer ${token}`)
    removed.assertStatus(200)
    assert.deepEqual(removed.body().data, { ok: true })

    const destroyed = await client
      .delete(`/api/v1/tags/${tag.id}`)
      .header('Authorization', `Bearer ${token}`)
    destroyed.assertStatus(200)
    assert.deepEqual(destroyed.body().data, { ok: true })
  })

  test('duplicate tag name returns 409 and harbor cannot read northstar tags', async ({
    client,
    assert,
  }) => {
    const northstar = await mintDemoToken(DEMO_USERS.northstarOwner)
    const name = `Shared-${Date.now()}`

    const created = await client
      .post('/api/v1/tags')
      .header('Authorization', `Bearer ${northstar}`)
      .json({ name })
    created.assertStatus(200)
    const tagId = created.body().data.id as string

    const duplicate = await client
      .post('/api/v1/tags')
      .header('Authorization', `Bearer ${northstar}`)
      .json({ name })
    duplicate.assertStatus(409)
    assert.equal(errorBody(duplicate).code, 'E_TAG_NAME_EXISTS')

    const harbor = await mintDemoToken(DEMO_USERS.harborOwner)
    const foreign = await client
      .get(`/api/v1/tags/${tagId}`)
      .header('Authorization', `Bearer ${harbor}`)
    foreign.assertStatus(404)
    assert.equal(errorBody(foreign).code, 'E_TAG_NOT_FOUND')

    const assignForeign = await client
      .post(`/api/v1/tags/${tagId}/contacts`)
      .header('Authorization', `Bearer ${harbor}`)
      .json({ contactId: FIXTURE_IDS.contacts.harborJordan })
    assignForeign.assertStatus(404)
  })

  test('cannot assign a soft-deleted contact', async ({ client, assert }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const created = await client
      .post('/api/v1/tags')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: `Deleted-${Date.now()}` })
    created.assertStatus(200)

    const assign = await client
      .post(`/api/v1/tags/${created.body().data.id}/contacts`)
      .header('Authorization', `Bearer ${token}`)
      .json({ contactId: FIXTURE_IDS.contacts.northstarDeleted })
    assign.assertStatus(422)
    assert.equal(errorBody(assign).code, 'E_TAG_INVALID_CONTACT')
  })

  test('owner can set description and status through existing create/patch endpoints', async ({
    client,
    assert,
  }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const name = `Group-${Date.now()}`

    const created = await client
      .post('/api/v1/tags')
      .header('Authorization', `Bearer ${token}`)
      .json({ name, description: 'VIP wholesale' })
    created.assertStatus(200)
    assert.equal(created.body().data.description, 'VIP wholesale')
    assert.equal(created.body().data.status, 'active')

    const described = await client
      .patch(`/api/v1/tags/${created.body().data.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ description: 'Updated note' })
    described.assertStatus(200)
    assert.equal(described.body().data.name, name)
    assert.equal(described.body().data.description, 'Updated note')
    assert.equal(described.body().data.status, 'active')

    const inactivated = await client
      .patch(`/api/v1/tags/${created.body().data.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ status: 'inactive' })
    inactivated.assertStatus(200)
    assert.equal(inactivated.body().data.status, 'inactive')
    assert.equal(inactivated.body().data.description, 'Updated note')

    const listed = await client.get('/api/v1/tags').header('Authorization', `Bearer ${token}`)
    const row = (
      listed.body().data as { id: string; status: string; description: string | null }[]
    ).find((item) => item.id === created.body().data.id)
    assert.equal(row?.status, 'inactive')
    assert.equal(row?.description, 'Updated note')

    const empty = await client
      .patch(`/api/v1/tags/${created.body().data.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({})
    empty.assertStatus(422)
    assert.equal(errorBody(empty).code, 'E_TAG_EMPTY_UPDATE')

    const invalidStatus = await client
      .patch(`/api/v1/tags/${created.body().data.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ status: 'archived' })
    invalidStatus.assertStatus(422)
  })
})
