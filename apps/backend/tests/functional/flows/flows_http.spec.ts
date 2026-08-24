import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'

const ACTIVE_ORG_BY_EMAIL: Record<string, string> = {
  [DEMO_USERS.northstarOwner]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarAdmin]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarAgent]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.northstarViewer]: FIXTURE_IDS.orgs.northstar,
  [DEMO_USERS.harborOwner]: FIXTURE_IDS.orgs.harbor,
}

function errorBody(response: { body: () => unknown }): {
  code?: string
  error?: string
  errors?: Array<{ code?: string }>
} {
  return response.body() as {
    code?: string
    error?: string
    errors?: Array<{ code?: string }>
  }
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

  const signed = await auth.api.signJWT({
    body: { payload: payload as Record<string, any> },
  })
  const token = (signed as { token?: string } | null)?.token
  if (!token) {
    throw new Error(`signJWT returned no token for ${email}`)
  }
  return token
}

function validGraphPayload() {
  return {
    nodes: [
      {
        id: 'trigger',
        type: 'TRIGGER',
        position: { x: 0, y: 0 },
        data: { label: 'Start' },
      },
      {
        id: 'message',
        type: 'MESSAGE',
        position: { x: 0, y: 80 },
        data: { label: 'Welcome', messageType: 'text', text: 'Hello' },
      },
      {
        id: 'buttons',
        type: 'INTERACTIVE_BUTTON',
        position: { x: 0, y: 160 },
        data: {
          label: 'Menu',
          bodyText: 'Pick one',
          buttons: [
            { id: 'btn_ok', title: 'OK' },
            { id: 'btn_stop', title: 'Stop', actionType: 'STOP' },
          ],
        },
      },
      {
        id: 'exit',
        type: 'EXIT',
        position: { x: 0, y: 240 },
        data: { label: 'Done' },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'message' },
      { id: 'e2', source: 'message', target: 'buttons' },
      { id: 'e3', source: 'buttons', sourceHandle: 'btn_ok', target: 'exit' },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

test.group('Flows HTTP', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  test('rejects unauthenticated list', async ({ client }) => {
    const response = await client.get('/api/v1/flows')
    response.assertStatus(401)
  })

  test('rejects viewer create', async ({ client }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarViewer)
    const response = await client
      .post('/api/v1/flows')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: `Viewer flow ${Date.now()}` })

    response.assertStatus(403)
  })

  test('owner draft → save → validate → publish and foreign org gets 404', async ({
    client,
    assert,
  }) => {
    const token = await mintDemoToken(DEMO_USERS.northstarOwner)
    const name = `Flow ${Date.now()}`

    const create = await client
      .post('/api/v1/flows')
      .header('Authorization', `Bearer ${token}`)
      .json({
        name,
        triggerType: 'KEYWORD',
        triggerConfig: { keywords: ['hi'], matchType: 'exact' },
      })
    create.assertStatus(200)
    const created = create.body().data as {
      id: string
      status: string
      version: { versionNumber: number; validationStatus: string }
    }
    assert.equal(created.status, 'DRAFT')
    assert.equal(created.version.versionNumber, 1)
    assert.equal(created.version.validationStatus, 'INVALID')

    const invalidValidate = await client
      .post(`/api/v1/flows/${created.id}/validate`)
      .header('Authorization', `Bearer ${token}`)
      .json({})
    invalidValidate.assertStatus(200)
    const invalidBody = invalidValidate.body().data as {
      valid: boolean
      errors: Array<{ code: string }>
    }
    assert.isFalse(invalidBody.valid)
    assert.isAbove(invalidBody.errors.length, 0)

    const invalidPublish = await client
      .post(`/api/v1/flows/${created.id}/publish`)
      .header('Authorization', `Bearer ${token}`)
    invalidPublish.assertStatus(422)
    assert.equal(errorBody(invalidPublish).code, 'E_FLOW_INVALID')

    const update = await client
      .patch(`/api/v1/flows/${created.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json(validGraphPayload())
    update.assertStatus(200)
    const updated = update.body().data as {
      version: { versionNumber: number; validationStatus: string; nodes: unknown[] }
    }
    assert.equal(updated.version.versionNumber, 1)
    assert.equal(updated.version.validationStatus, 'VALID')
    assert.lengthOf(updated.version.nodes, 4)

    const validValidate = await client
      .post(`/api/v1/flows/${created.id}/validate`)
      .header('Authorization', `Bearer ${token}`)
      .json({})
    validValidate.assertStatus(200)
    assert.isTrue((validValidate.body().data as { valid: boolean }).valid)

    const publish = await client
      .post(`/api/v1/flows/${created.id}/publish`)
      .header('Authorization', `Bearer ${token}`)
    publish.assertStatus(200)
    const published = publish.body().data as {
      status: string
      publishedVersionId: string
      version: { id: string; versionNumber: number }
    }
    assert.equal(published.status, 'PUBLISHED')
    assert.equal(published.publishedVersionId, published.version.id)
    assert.equal(published.version.versionNumber, 1)

    const fork = await client
      .patch(`/api/v1/flows/${created.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        ...validGraphPayload(),
        name: `${name} edited`,
      })
    fork.assertStatus(200)
    assert.equal(
      (fork.body().data as { version: { versionNumber: number } }).version.versionNumber,
      2
    )

    const harbor = await mintDemoToken(DEMO_USERS.harborOwner)
    const foreign = await client
      .get(`/api/v1/flows/${created.id}`)
      .header('Authorization', `Bearer ${harbor}`)
    foreign.assertStatus(404)
    assert.equal(errorBody(foreign).code, 'E_FLOW_NOT_FOUND')
  })

  test('agent can list but cannot publish', async ({ client }) => {
    const owner = await mintDemoToken(DEMO_USERS.northstarOwner)
    const created = await client
      .post('/api/v1/flows')
      .header('Authorization', `Bearer ${owner}`)
      .json({
        name: `Agent gate ${Date.now()}`,
        triggerType: 'INBOUND_ANY',
      })
    created.assertStatus(200)
    const flowId = (created.body().data as { id: string }).id

    const agent = await mintDemoToken(DEMO_USERS.northstarAgent)
    const list = await client.get('/api/v1/flows').header('Authorization', `Bearer ${agent}`)
    list.assertStatus(200)

    const publish = await client
      .post(`/api/v1/flows/${flowId}/publish`)
      .header('Authorization', `Bearer ${agent}`)
    publish.assertStatus(403)
  })
})
