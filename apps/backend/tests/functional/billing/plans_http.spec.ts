import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
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
        limits: { users: 5, messagesPerMonth: 100 },
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

  test('rejects creating a duplicate active logical plan', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const suffix = randomUUID().slice(0, 8)

    const created = await client
      .post('/api/v1/super-admin/plans')
      .header('Authorization', `Bearer ${token}`)
      .json({
        name: `HTTP Dup Create ${suffix}`,
        code: `http_dup_${suffix}`,
        price: 1800,
        currency: 'INR',
        billingPeriod: 'monthly',
        status: 'active',
        limits: {},
      })

    created.assertStatus(200)
    const planId = created.body().data.id as string

    try {
      const duplicate = await client
        .post('/api/v1/super-admin/plans')
        .header('Authorization', `Bearer ${token}`)
        .json({
          name: `HTTP Dup Create ${suffix}`,
          code: `http_dup_2_${suffix}`,
          price: 1800,
          currency: 'INR',
          billingPeriod: 'monthly',
          status: 'active',
          limits: {},
        })

      duplicate.assertStatus(409)
      assert.equal(duplicate.body().code, 'E_PLAN_DUPLICATE_ACTIVE')
    } finally {
      await db.from('plans').where('id', planId).delete()
    }
  })

  test('allows a yearly variant and a different price of the same name', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const suffix = randomUUID().slice(0, 8)
    const createdIds: string[] = []

    try {
      const monthly = await client
        .post('/api/v1/super-admin/plans')
        .header('Authorization', `Bearer ${token}`)
        .json({
          name: `HTTP Variant ${suffix}`,
          code: `http_var_m_${suffix}`,
          price: 999,
          currency: 'INR',
          billingPeriod: 'monthly',
          status: 'active',
          limits: {},
        })
      monthly.assertStatus(200)
      createdIds.push(monthly.body().data.id as string)

      const yearly = await client
        .post('/api/v1/super-admin/plans')
        .header('Authorization', `Bearer ${token}`)
        .json({
          name: `HTTP Variant ${suffix}`,
          code: `http_var_y_${suffix}`,
          price: 9999,
          currency: 'INR',
          billingPeriod: 'yearly',
          status: 'active',
          limits: {},
        })
      yearly.assertStatus(200)
      createdIds.push(yearly.body().data.id as string)
      assert.notEqual(yearly.body().data.id, monthly.body().data.id)

      const dearer = await client
        .post('/api/v1/super-admin/plans')
        .header('Authorization', `Bearer ${token}`)
        .json({
          name: `HTTP Variant ${suffix}`,
          code: `http_var_hi_${suffix}`,
          price: 1999,
          currency: 'INR',
          billingPeriod: 'monthly',
          status: 'active',
          limits: {},
        })
      dearer.assertStatus(200)
      createdIds.push(dearer.body().data.id as string)
      assert.notEqual(dearer.body().data.id, monthly.body().data.id)
    } finally {
      if (createdIds.length > 0) {
        await db.from('plans').whereIn('id', createdIds).delete()
      }
    }
  })

  test('creating an archived equivalent reactivates the existing row', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const suffix = randomUUID().slice(0, 8)

    const created = await client
      .post('/api/v1/super-admin/plans')
      .header('Authorization', `Bearer ${token}`)
      .json({
        name: `HTTP Reuse ${suffix}`,
        code: `http_reuse_${suffix}`,
        price: 1500,
        currency: 'INR',
        billingPeriod: 'monthly',
        status: 'active',
        limits: { users: 4 },
      })
    created.assertStatus(200)
    const planId = created.body().data.id as string

    try {
      const archived = await client
        .delete(`/api/v1/super-admin/plans/${planId}`)
        .header('Authorization', `Bearer ${token}`)
      archived.assertStatus(200)
      assert.equal(archived.body().data.status, 'archived')

      const reused = await client
        .post('/api/v1/super-admin/plans')
        .header('Authorization', `Bearer ${token}`)
        .json({
          name: `HTTP Reuse ${suffix}`,
          code: `http_reuse_new_${suffix}`,
          price: 1500,
          currency: 'INR',
          billingPeriod: 'monthly',
          status: 'active',
          limits: { users: 8 },
        })
      reused.assertStatus(200)
      assert.equal(reused.body().data.id, planId)
      assert.equal(reused.body().data.status, 'active')
      assert.equal(reused.body().data.limits.users, 8)
    } finally {
      await db.from('plans').where('id', planId).delete()
    }
  })
})
