import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { PLATFORM_AUDIT_EVENT_TYPES, TENANT_AUDIT_EVENT_TYPES } from '#abilities/audit_events'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { assertListEnvelope, unwrapListEnvelope } from '#tests/helpers/list_envelope'

type AuditEvent = {
  id: string
  eventType: string
  organizationId: string | null
  actorUserId: string | null
  targetType: string
  reason: string | null
}

const FILLER_COUNT = 55
const WINDOW_LIMIT = 50
const NEEDLE_CREATED_AT = new Date('2020-06-15T12:00:00.000Z')

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

function eventsFrom(body: unknown): AuditEvent[] {
  return unwrapListEnvelope<AuditEvent>(body).items
}

async function insertAudit(row: {
  organizationId?: string | null
  actorUserId?: string | null
  targetType: string
  eventType: string
  reason?: string | null
  createdAt: Date
}) {
  const [inserted] = await db
    .table('authorization_audits')
    .insert({
      organizationId: row.organizationId ?? null,
      actorUserId: row.actorUserId ?? null,
      targetType: row.targetType,
      eventType: row.eventType,
      reason: row.reason ?? null,
      after: JSON.stringify({ marker: 'bug011' }),
      createdAt: row.createdAt,
    })
    .returning(['id'])
  return inserted.id as string
}

test.group('BUG-011 audit list filters apply before limit', (group) => {
  const createdIds: string[] = []
  const runId = randomUUID()
  const actorId = randomUUID()
  const tenantSearch = `bug011-tenant-${runId}`
  const platformSearch = `bug011-platform-${runId}`
  const rbacSearch = `bug011-rbac-${runId}`
  const missingSearch = `bug011-missing-${runId}`
  const actorName = `Bug011 Actor ${runId.slice(0, 8)}`
  const actorEmail = `bug011-actor-${runId.slice(0, 8)}@example.com`

  let tenantNeedleId = ''
  let platformNeedleId = ''
  let extraMatchIds: string[] = []

  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()

    await db.table('users').insert({
      id: actorId,
      name: actorName,
      firstname: 'Bug011',
      lastname: 'Actor',
      email: actorEmail,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const newest = Date.now() + 60_000

    for (let index = 0; index < FILLER_COUNT; index++) {
      createdIds.push(
        await insertAudit({
          organizationId: FIXTURE_IDS.orgs.northstar,
          actorUserId: FIXTURE_IDS.users.northstarAdmin,
          targetType: 'invitation',
          eventType: 'invitation.accepted',
          reason: `bug011-tenant-filler-${runId}-${index}`,
          createdAt: new Date(newest + index * 1000),
        })
      )
      createdIds.push(
        await insertAudit({
          organizationId: FIXTURE_IDS.orgs.harbor,
          actorUserId: FIXTURE_IDS.users.superadmin,
          targetType: 'organization',
          eventType: 'organization.updated',
          reason: `bug011-platform-filler-${runId}-${index}`,
          createdAt: new Date(newest + 120_000 + index * 1000),
        })
      )
    }

    tenantNeedleId = await insertAudit({
      organizationId: FIXTURE_IDS.orgs.northstar,
      actorUserId: actorId,
      targetType: 'smtp_config',
      eventType: 'smtp_config.test_sent',
      reason: tenantSearch,
      createdAt: NEEDLE_CREATED_AT,
    })
    createdIds.push(tenantNeedleId)

    extraMatchIds = [
      await insertAudit({
        organizationId: FIXTURE_IDS.orgs.northstar,
        actorUserId: actorId,
        targetType: 'smtp_config',
        eventType: 'smtp_config.test_sent',
        reason: tenantSearch,
        createdAt: new Date('2020-06-15T11:00:00.000Z'),
      }),
      await insertAudit({
        organizationId: FIXTURE_IDS.orgs.northstar,
        actorUserId: actorId,
        targetType: 'smtp_config',
        eventType: 'smtp_config.test_sent',
        reason: tenantSearch,
        createdAt: new Date('2020-06-15T10:00:00.000Z'),
      }),
    ]
    createdIds.push(...extraMatchIds)

    createdIds.push(
      await insertAudit({
        organizationId: FIXTURE_IDS.orgs.harbor,
        actorUserId: FIXTURE_IDS.users.harborOwner,
        targetType: 'smtp_config',
        eventType: 'smtp_config.test_sent',
        reason: tenantSearch,
        createdAt: NEEDLE_CREATED_AT,
      })
    )

    platformNeedleId = await insertAudit({
      organizationId: FIXTURE_IDS.orgs.northstar,
      actorUserId: actorId,
      targetType: 'plan',
      eventType: 'plan.created',
      reason: platformSearch,
      createdAt: NEEDLE_CREATED_AT,
    })
    createdIds.push(platformNeedleId)

    createdIds.push(
      await insertAudit({
        organizationId: FIXTURE_IDS.orgs.northstar,
        actorUserId: FIXTURE_IDS.users.northstarOwner,
        targetType: 'role',
        eventType: 'role.created',
        reason: rbacSearch,
        createdAt: NEEDLE_CREATED_AT,
      })
    )
  })

  group.teardown(async () => {
    if (createdIds.length > 0) {
      await db.from('authorization_audits').whereIn('id', createdIds).delete()
    }
    await db.from('users').where('id', actorId).delete()
  })

  test('unfiltered tenant window does not include the old needle', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(`/api/v1/audit?limit=${WINDOW_LIMIT}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assertListEnvelope(assert, response.body())
    const events = eventsFrom(response.body())
    assert.equal(events.length, WINDOW_LIMIT)
    assert.isFalse(events.some((event) => event.id === tenantNeedleId))
  })

  test('organization search finds an event outside the newest 50', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(`/api/v1/audit?limit=${WINDOW_LIMIT}&search=${encodeURIComponent(tenantSearch)}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response.body())
    assert.isTrue(events.some((event) => event.id === tenantNeedleId))
    assert.isTrue(events.every((event) => event.organizationId === FIXTURE_IDS.orgs.northstar))
  })

  test('organization search matches actor name case-insensitively', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(
        `/api/v1/audit?limit=${WINDOW_LIMIT}&search=${encodeURIComponent(actorName.toUpperCase())}`
      )
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response.body())
    assert.isTrue(events.some((event) => event.id === tenantNeedleId))
  })

  test('organization eventType filter finds an older event', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(`/api/v1/audit?limit=${WINDOW_LIMIT}&eventType=smtp_config.test_sent`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response.body())
    assert.isTrue(events.some((event) => event.id === tenantNeedleId))
    assert.isTrue(events.every((event) => event.eventType === 'smtp_config.test_sent'))
  })

  test('organization actor filter finds an older event', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(`/api/v1/audit?limit=${WINDOW_LIMIT}&actorUserId=${actorId}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response.body())
    assert.isTrue(events.some((event) => event.id === tenantNeedleId))
    assert.isTrue(events.every((event) => event.actorUserId === actorId))
  })

  test('organization targetType filter finds an older event', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(`/api/v1/audit?limit=${WINDOW_LIMIT}&targetType=smtp_config`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response.body())
    assert.isTrue(events.some((event) => event.id === tenantNeedleId))
    assert.isTrue(events.every((event) => event.targetType === 'smtp_config'))
  })

  test('organization dateFrom/dateTo finds an older event', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(`/api/v1/audit?limit=${WINDOW_LIMIT}&dateFrom=2020-06-15&dateTo=2020-06-15`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response.body())
    assert.isTrue(events.some((event) => event.id === tenantNeedleId))
  })

  test('organization filters still respect organization isolation', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(`/api/v1/audit?limit=${WINDOW_LIMIT}&search=${encodeURIComponent(tenantSearch)}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response.body())
    assert.isTrue(events.every((event) => event.organizationId === FIXTURE_IDS.orgs.northstar))
    assert.isFalse(events.some((event) => event.organizationId === FIXTURE_IDS.orgs.harbor))
  })

  test('organization client-supplied organizationId cannot bypass tenant scope', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(
        `/api/v1/audit?limit=${WINDOW_LIMIT}&organizationId=${FIXTURE_IDS.orgs.harbor}&search=${encodeURIComponent(tenantSearch)}`
      )
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response.body())
    assert.isTrue(events.some((event) => event.id === tenantNeedleId))
    assert.isTrue(events.every((event) => event.organizationId === FIXTURE_IDS.orgs.northstar))
    assert.isFalse(events.some((event) => event.organizationId === FIXTURE_IDS.orgs.harbor))
  })

  test('tenant eventType outside the catalog is rejected', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get('/api/v1/audit?eventType=organization.created')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(422)
  })

  test('unfiltered platform window does not include the old needle', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(`/api/v1/super-admin/audit-logs?limit=${WINDOW_LIMIT}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response.body())
    assert.equal(events.length, WINDOW_LIMIT)
    assert.isFalse(events.some((event) => event.id === platformNeedleId))
  })

  test('super admin search finds an event outside the newest limit', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(
        `/api/v1/super-admin/audit-logs?limit=${WINDOW_LIMIT}&search=${encodeURIComponent(platformSearch)}`
      )
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response.body())
    assert.isTrue(events.some((event) => event.id === platformNeedleId))
  })

  test('super admin eventType filter works', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(`/api/v1/super-admin/audit-logs?limit=${WINDOW_LIMIT}&eventType=plan.created`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response.body())
    assert.isTrue(events.some((event) => event.id === platformNeedleId))
    assert.isTrue(events.every((event) => event.eventType === 'plan.created'))
    assert.isTrue(
      events.every((event) =>
        (PLATFORM_AUDIT_EVENT_TYPES as readonly string[]).includes(event.eventType)
      )
    )
  })

  test('super admin actor filter works', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(`/api/v1/super-admin/audit-logs?limit=${WINDOW_LIMIT}&actorUserId=${actorId}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response.body())
    assert.isTrue(events.some((event) => event.id === platformNeedleId))
    assert.isTrue(events.every((event) => event.actorUserId === actorId))
  })

  test('super admin targetType filter works', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(`/api/v1/super-admin/audit-logs?limit=${WINDOW_LIMIT}&targetType=plan`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response.body())
    assert.isTrue(events.some((event) => event.id === platformNeedleId))
    assert.isTrue(events.every((event) => event.targetType === 'plan'))
  })

  test('super admin date range works', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(
        `/api/v1/super-admin/audit-logs?limit=${WINDOW_LIMIT}&dateFrom=2020-06-15&dateTo=2020-06-15`
      )
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response.body())
    assert.isTrue(events.some((event) => event.id === platformNeedleId))
  })

  test('super admin organizationId filter works', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(
        `/api/v1/super-admin/audit-logs?limit=${WINDOW_LIMIT}&organizationId=${FIXTURE_IDS.orgs.northstar}`
      )
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response.body())
    assert.isTrue(events.some((event) => event.id === platformNeedleId))
    assert.isTrue(events.every((event) => event.organizationId === FIXTURE_IDS.orgs.northstar))
    assert.isFalse(events.some((event) => event.organizationId === FIXTURE_IDS.orgs.harbor))
  })

  test('super admin cannot expose tenant-only RBAC audit events', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const searchResponse = await client
      .get(
        `/api/v1/super-admin/audit-logs?limit=${WINDOW_LIMIT}&search=${encodeURIComponent(rbacSearch)}`
      )
      .header('Authorization', `Bearer ${token}`)

    searchResponse.assertStatus(200)
    const searched = eventsFrom(searchResponse.body())
    assert.lengthOf(searched, 0)
    assert.isFalse(searched.some((event) => event.eventType === 'role.created'))

    const catalogResponse = await client
      .get('/api/v1/super-admin/audit-logs?eventType=role.created')
      .header('Authorization', `Bearer ${token}`)
    catalogResponse.assertStatus(422)
  })

  test('limit is applied after filtering', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(`/api/v1/audit?limit=2&search=${encodeURIComponent(tenantSearch)}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const events = eventsFrom(response.body())
    assert.equal(events.length, 2)
    const ids = events.map((event) => event.id)
    assert.isTrue(ids.every((id) => [tenantNeedleId, ...extraMatchIds].includes(id)))
    assert.isFalse(events.some((event) => event.eventType === 'invitation.accepted'))
  })

  test('empty search behaves like the recent audit query', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const [plain, emptySearch] = await Promise.all([
      client.get('/api/v1/audit?limit=10').header('Authorization', `Bearer ${token}`),
      client.get('/api/v1/audit?limit=10&search=').header('Authorization', `Bearer ${token}`),
    ])

    plain.assertStatus(200)
    emptySearch.assertStatus(200)
    const recent = eventsFrom(plain.body())
    const empty = eventsFrom(emptySearch.body())
    assert.equal(recent.length, 10)
    assert.deepEqual(
      empty.map((event) => event.id),
      recent.map((event) => event.id)
    )
    assert.isFalse(recent.some((event) => event.id === tenantNeedleId))
  })

  test('nonexistent search returns an empty result', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(`/api/v1/audit?limit=${WINDOW_LIMIT}&search=${encodeURIComponent(missingSearch)}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.lengthOf(eventsFrom(response.body()), 0)
  })

  test('recent-audit callers using limit 10 stay a wrapped list without facets', async ({
    client,
    assert,
  }) => {
    const tenantToken = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const tenantResponse = await client
      .get('/api/v1/audit?limit=10')
      .header('Authorization', `Bearer ${tenantToken}`)
    tenantResponse.assertStatus(200)
    const tenantEvents = eventsFrom(tenantResponse.body())
    const tenantBody = tenantResponse.body() as { eventTypes?: string[]; actors?: unknown }
    assert.equal(tenantEvents.length, 10)
    assert.isUndefined(tenantBody.eventTypes)
    assert.isUndefined(tenantBody.actors)
    assert.isTrue(
      tenantEvents.every((event) =>
        (TENANT_AUDIT_EVENT_TYPES as readonly string[]).includes(event.eventType)
      )
    )

    const platformToken = await mintToken(DEMO_USERS.superadmin)
    const platformResponse = await client
      .get('/api/v1/super-admin/audit-logs?limit=10')
      .header('Authorization', `Bearer ${platformToken}`)
    platformResponse.assertStatus(200)
    const platformEvents = eventsFrom(platformResponse.body())
    const platformBody = platformResponse.body() as { eventTypes?: string[]; actors?: unknown }
    assert.equal(platformEvents.length, 10)
    assert.isUndefined(platformBody.eventTypes)
    assert.isUndefined(platformBody.actors)
    assert.isTrue(
      platformEvents.every((event) =>
        (PLATFORM_AUDIT_EVENT_TYPES as readonly string[]).includes(event.eventType)
      )
    )
  })

  test('includeFacets event types come from the catalog not the fetched window', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get('/api/v1/audit?limit=1&includeFacets=true')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body() as {
      data?: AuditEvent[]
      eventTypes?: string[]
      actors?: Array<{ id: string }>
      targetTypes?: string[]
    }
    assert.equal(body.data?.length, 1)
    assert.include(body.eventTypes ?? [], 'smtp_config.test_sent')
    assert.deepEqual(body.eventTypes, [...TENANT_AUDIT_EVENT_TYPES])
    assert.isTrue((body.actors ?? []).some((actor) => actor.id === actorId))
    assert.include(body.targetTypes ?? [], 'smtp_config')
  })

  test('invalid dates are rejected', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.northstarAdmin, FIXTURE_IDS.orgs.northstar)
    const fromResponse = await client
      .get('/api/v1/audit?dateFrom=not-a-date')
      .header('Authorization', `Bearer ${token}`)
    fromResponse.assertStatus(422)

    const toResponse = await client
      .get('/api/v1/audit?dateTo=2020-99-99')
      .header('Authorization', `Bearer ${token}`)
    toResponse.assertStatus(422)
  })
})
