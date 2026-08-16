import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'

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

test.group('Super-admin plans HTTP', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  test('rejects unauthenticated list', async ({ client }) => {
    const response = await client.get('/api/v1/super-admin/plans')
    response.assertStatus(401)
  })

  test('rejects tenant JWT', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarOwner, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get('/api/v1/super-admin/plans')
      .header('Authorization', `Bearer ${token}`)

    assert.isTrue([401, 403].includes(response.response.status))
  })

  test('superadmin can list, create custom, get, update, and archive', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)

    const listed = await client
      .get('/api/v1/super-admin/plans')
      .header('Authorization', `Bearer ${token}`)
    listed.assertStatus(200)
    assert.isArray(listed.body().data.items)
    assert.isObject(listed.body().data.summary)

    const created = await client
      .post('/api/v1/super-admin/plans')
      .header('Authorization', `Bearer ${token}`)
      .json({
        name: 'HTTP Custom Plan',
        description: 'No Razorpay sync',
        price: null,
        currency: 'USD',
        billingPeriod: 'custom',
        status: 'draft',
        trialDays: 0,
        limits: { users: 5, messagesPerMonth: 100, workspaces: 1 },
        features: [
          {
            key: 'whatsappMessaging',
            name: 'whatsappMessaging',
            enabled: true,
            category: 'messaging',
          },
        ],
      })

    created.assertStatus(200)
    const planId = created.body().data.id as string
    assert.equal(created.body().data.status, 'draft')
    assert.isNull(created.body().data.gatewayPlanId)

    const shown = await client
      .get(`/api/v1/super-admin/plans/${planId}`)
      .header('Authorization', `Bearer ${token}`)
    shown.assertStatus(200)
    assert.equal(shown.body().data.name, 'HTTP Custom Plan')

    const updated = await client
      .patch(`/api/v1/super-admin/plans/${planId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'HTTP Custom Plan Renamed', status: 'active' })
    updated.assertStatus(200)
    assert.equal(updated.body().data.name, 'HTTP Custom Plan Renamed')
    assert.equal(updated.body().data.status, 'active')

    const archived = await client
      .delete(`/api/v1/super-admin/plans/${planId}`)
      .header('Authorization', `Bearer ${token}`)
    archived.assertStatus(200)
    assert.equal(archived.body().data.status, 'archived')

    await db.from('plans').where('id', planId).delete()
  })
})
