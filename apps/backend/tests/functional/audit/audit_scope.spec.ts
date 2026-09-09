import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { PLATFORM_AUDIT_EVENT_TYPES, TENANT_AUDIT_EVENT_TYPES } from '#abilities/audit_events'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import { ensureDemoFixtures } from '#tests/helpers/ensure_demo_fixtures'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'

type AuditEvent = { eventType: string; organizationId: string | null }

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

function eventsFrom(response: {
  body: () => { data?: AuditEvent[] } | AuditEvent[]
}): AuditEvent[] {
  const body = response.body()
  const data = Array.isArray(body) ? body : body.data
  return Array.isArray(data) ? data : []
}

test.group('Audit scope isolation', (group) => {
  group.setup(async () => {
    await ensureDemoFixtures()
  })

  test('superadmin without tenant org cannot hit GET /api/v1/audit', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client.get('/api/v1/audit').header('Authorization', `Bearer ${token}`)
    response.assertStatus(403)
  })

  test('tenant with only team:view cannot list tenant audit', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.northstarAgent, FIXTURE_IDS.orgs.northstar)
    const response = await client.get('/api/v1/audit').header('Authorization', `Bearer ${token}`)
    response.assertStatus(403)
  })

  test('platform list excludes tenant RBAC even with organizationId', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(`/api/v1/super-admin/audit-logs?organizationId=${FIXTURE_IDS.orgs.northstar}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response)
    assert.isTrue(
      events.every((e) => (PLATFORM_AUDIT_EVENT_TYPES as readonly string[]).includes(e.eventType))
    )
    assert.isFalse(events.some((e) => e.eventType === 'role.created'))
    assert.isFalse(events.some((e) => e.eventType === 'invitation.created'))
    assert.isFalse(events.some((e) => e.eventType === 'role.permission_override'))
  })

  test('tenant cannot widen org via query and never sees platform events', async ({
    client,
    assert,
  }) => {
    const [northstarRow] = await db
      .table('authorization_audits')
      .insert({
        organizationId: FIXTURE_IDS.orgs.northstar,
        actorUserId: FIXTURE_IDS.users.northstarAdmin,
        targetType: 'role',
        eventType: 'role.created',
        after: JSON.stringify({ name: 'northstar-isolation' }),
      })
      .returning(['id'])
    const [harborRow] = await db
      .table('authorization_audits')
      .insert({
        organizationId: FIXTURE_IDS.orgs.harbor,
        actorUserId: FIXTURE_IDS.users.harborOwner,
        targetType: 'role',
        eventType: 'role.created',
        after: JSON.stringify({ name: 'harbor-isolation' }),
      })
      .returning(['id'])

    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(`/api/v1/audit?organizationId=${FIXTURE_IDS.orgs.harbor}&limit=100`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response)
    assert.isAbove(events.length, 0, JSON.stringify(response.body()))
    assert.isTrue(
      events.every((e) => (TENANT_AUDIT_EVENT_TYPES as readonly string[]).includes(e.eventType))
    )
    assert.isTrue(events.every((e) => e.organizationId === FIXTURE_IDS.orgs.northstar))
    assert.isFalse(events.some((e) => e.eventType === 'organization.created'))
    assert.isTrue(events.some((e) => e.eventType === 'role.created'))

    await db.from('authorization_audits').whereIn('id', [northstarRow.id, harborRow.id]).delete()
  })

  test('creating a plan emits platform-only plan.created', async ({ client, assert }) => {
    const superToken = await mintToken(DEMO_USERS.superadmin)
    const created = await client
      .post('/api/v1/super-admin/plans')
      .header('Authorization', `Bearer ${superToken}`)
      .json({
        name: 'Audit Scope Plan',
        description: 'Emit assertion',
        price: null,
        currency: 'USD',
        billingPeriod: 'custom',
        status: 'draft',
        trialDays: 0,
        limits: { users: 1, messagesPerMonth: 10 },
        features: [],
      })

    created.assertStatus(200)
    const planId = created.body().data.id as string

    const row = await db
      .from('authorization_audits')
      .where('eventType', 'plan.created')
      .where('targetId', planId)
      .first()

    assert.exists(row)
    assert.isNull(row.organizationId)

    const platform = await client
      .get('/api/v1/super-admin/audit-logs?limit=100')
      .header('Authorization', `Bearer ${superToken}`)
    platform.assertStatus(200)
    const platformEvents = eventsFrom(platform)
    assert.isTrue(
      platformEvents.some((e) => e.eventType === 'plan.created' && e.organizationId === null)
    )
    assert.isTrue(
      platformEvents.every((e) =>
        (PLATFORM_AUDIT_EVENT_TYPES as readonly string[]).includes(e.eventType)
      )
    )

    const tenantToken = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const tenant = await client
      .get('/api/v1/audit?limit=100')
      .header('Authorization', `Bearer ${tenantToken}`)
    tenant.assertStatus(200)
    const tenantEvents = eventsFrom(tenant)
    assert.isFalse(tenantEvents.some((e) => e.eventType === 'plan.created'))
    assert.isTrue(
      tenantEvents.every((e) =>
        (TENANT_AUDIT_EVENT_TYPES as readonly string[]).includes(e.eventType)
      )
    )

    await db.from('authorization_audits').where('targetId', planId).delete()
    await db.from('plans').where('id', planId).delete()
  })
})
