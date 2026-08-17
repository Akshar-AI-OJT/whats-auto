import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import emitter from '@adonisjs/core/services/emitter'
import IntegrationEventReceived from '#events/integration_event_received'
import { generateApiKey } from '#lib/integrations/api_key_crypto'
import { ApiKeyRepository } from '#repositories/api_key_repository'
import { IntegrationConnectionRepository } from '#repositories/integration_connection_repository'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `int-ing-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Integrations ingress ${slug}`,
      slug,
      email: `${slug}@example.com`,
      country: 'IN',
      timezone: 'UTC',
      currency: 'INR',
      status: true,
    })
    .returning(['id'])
  return row.id as string
}

async function seedKey(organizationId: string) {
  const generated = generateApiKey()
  const row = await runWithTenant(organizationId, async () => {
    return new ApiKeyRepository().insert({
      organizationId,
      name: 'Ingress',
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      scopes: ['events:write'],
    })
  })
  return { ...generated, id: row.id }
}

function errorBody(response: { body: () => unknown }): { code?: string; error?: string } {
  const body = response.body() as { code?: string; error?: string }
  return { code: body.code, error: body.error }
}

test.group('Integration ingress HTTP', () => {
  test('rejects missing and invalid keys', async ({ client, assert }) => {
    const missing = await client.post('/api/v1/integrations/events').json({
      externalEventId: 'crm_1',
      type: 'crm.contact_upserted',
      occurredAt: '2026-08-17T12:00:00.000Z',
      payload: { phone: '+919999999999' },
    })
    missing.assertStatus(401)
    assert.equal(errorBody(missing).code, 'E_API_KEY_MISSING')

    const invalid = await client
      .post('/api/v1/integrations/events')
      .header('Authorization', 'Bearer wta_live_deadbeef_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
      .json({
        externalEventId: 'crm_1',
        type: 'crm.contact_upserted',
        occurredAt: '2026-08-17T12:00:00.000Z',
        payload: { phone: '+919999999999' },
      })
    invalid.assertStatus(401)
    assert.equal(errorBody(invalid).code, 'E_API_KEY_INVALID')
  })

  test('rejects a revoked key', async ({ client, assert }) => {
    const organizationId = await createOrg()
    const key = await seedKey(organizationId)
    await runWithTenant(organizationId, async () => {
      await new ApiKeyRepository().revokeForOrg({ organizationId, id: key.id })
    })

    const response = await client
      .post('/api/v1/integrations/events')
      .header('Authorization', `Bearer ${key.rawToken}`)
      .json({
        externalEventId: 'crm_revoked',
        type: 'crm.contact_upserted',
        occurredAt: '2026-08-17T12:00:00.000Z',
        payload: { phone: '+919999999999' },
      })
    response.assertStatus(401)
    assert.equal(errorBody(response).code, 'E_API_KEY_INVALID')
  })

  test('accepts a generic event, strips secrets, and is idempotent', async ({ client, assert }) => {
    const organizationId = await createOrg()
    const key = await seedKey(organizationId)
    const externalEventId = `crm_${randomUUID().slice(0, 8)}`
    const received: string[] = []
    const onReceived = (event: IntegrationEventReceived) => {
      received.push(event.payload.integrationEventId)
    }
    emitter.on(IntegrationEventReceived, onReceived)

    try {
      const first = await client
        .post('/api/v1/integrations/events')
        .header('Authorization', `Bearer ${key.rawToken}`)
        .json({
          externalEventId,
          type: 'crm.contact_upserted',
          occurredAt: '2026-08-17T12:00:00.000Z',
          payload: { phone: '+919999999999', apiKey: 'should-strip' },
        })
      first.assertStatus(200)
      assert.equal(first.body().data.status, 'accepted')
      const eventId = first.body().data.eventId as string

      const second = await client
        .post('/api/v1/integrations/events')
        .header('x-api-key', key.rawToken)
        .json({
          externalEventId,
          type: 'crm.contact_upserted',
          occurredAt: '2026-08-17T12:00:00.000Z',
          payload: { phone: '+919999999999' },
        })
      second.assertStatus(200)
      assert.equal(second.body().data.eventId, eventId)
      assert.deepEqual(received, [eventId])

      const rows = await runWithTenant(organizationId, async () => {
        return db.from('integration_events').where('organizationId', organizationId)
      })
      assert.equal(rows.length, 1)
      assert.equal(rows[0].eventType, 'crm.contact_upserted')
      const stored = rows[0].payload as { data?: Record<string, unknown> }
      assert.isUndefined(stored.data?.apiKey)
      assert.equal(stored.data?.phone, '+919999999999')

      const keyRow = await runWithTenant(organizationId, async () => {
        return db.from('api_keys').where('id', key.id).first()
      })
      assert.isNotNull(keyRow?.lastUsedAt)
    } finally {
      emitter.off(IntegrationEventReceived, onReceived)
    }
  })

  test('maps Shopenup COD and prepaid order.placed', async ({ client, assert }) => {
    const organizationId = await createOrg()
    const key = await seedKey(organizationId)
    await runWithTenant(organizationId, async () => {
      await new IntegrationConnectionRepository().upsertForOrg({
        organizationId,
        provider: 'shopenup',
        displayName: 'Store',
      })
    })

    const cod = await client
      .post('/api/v1/integrations/shopenup/events')
      .header('Authorization', `Bearer ${key.rawToken}`)
      .json({
        eventType: 'order.placed',
        data: { orderId: 'ord_cod', isCod: true, customerPhone: '+919111111111' },
      })
    cod.assertStatus(200)

    const paid = await client
      .post('/api/v1/integrations/shopenup/events')
      .header('Authorization', `Bearer ${key.rawToken}`)
      .json({
        eventType: 'order.placed',
        data: { orderId: 'ord_paid', payment_status: 'captured' },
      })
    paid.assertStatus(200)

    const rows = await runWithTenant(organizationId, async () => {
      return db
        .from('integration_events')
        .where('organizationId', organizationId)
        .orderBy('eventType')
    })
    assert.equal(rows.length, 2)
    assert.equal(rows[0].eventType, 'commerce.order_paid')
    assert.equal(rows[1].eventType, 'commerce.order_placed')
    assert.isNotNull(rows[0].connectionId)
    assert.isNotNull(rows[1].connectionId)
  })

  test('rejects unknown Shopenup event types', async ({ client, assert }) => {
    const organizationId = await createOrg()
    const key = await seedKey(organizationId)
    const response = await client
      .post('/api/v1/integrations/shopenup/events')
      .header('Authorization', `Bearer ${key.rawToken}`)
      .json({
        eventType: 'order.refunded',
        data: { orderId: 'ord_x' },
      })
    response.assertStatus(422)
    assert.equal(errorBody(response).code, 'E_INTEGRATION_EVENT_UNMAPPED')
  })

  test('API key binds events to its own organization', async ({ client, assert }) => {
    const orgA = await createOrg()
    const orgB = await createOrg()
    const keyA = await seedKey(orgA)
    const keyB = await seedKey(orgB)
    const externalEventId = `shared_${randomUUID().slice(0, 8)}`

    const first = await client
      .post('/api/v1/integrations/events')
      .header('Authorization', `Bearer ${keyA.rawToken}`)
      .json({
        externalEventId,
        type: 'crm.contact_upserted',
        occurredAt: '2026-08-17T12:00:00.000Z',
        payload: { phone: '+919111111111' },
      })
    first.assertStatus(200)

    const second = await client
      .post('/api/v1/integrations/events')
      .header('Authorization', `Bearer ${keyB.rawToken}`)
      .json({
        externalEventId,
        type: 'crm.contact_upserted',
        occurredAt: '2026-08-17T12:00:00.000Z',
        payload: { phone: '+919222222222' },
      })
    second.assertStatus(200)
    assert.notEqual(second.body().data.eventId, first.body().data.eventId)

    const rowsA = await runWithTenant(orgA, async () => {
      return db.from('integration_events').where('organizationId', orgA)
    })
    const rowsB = await runWithTenant(orgB, async () => {
      return db.from('integration_events').where('organizationId', orgB)
    })
    assert.equal(rowsA.length, 1)
    assert.equal(rowsB.length, 1)
    assert.equal(rowsA[0].organizationId, orgA)
    assert.equal(rowsB[0].organizationId, orgB)
  })
})
