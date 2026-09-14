import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { generateApiKey } from '#lib/integrations/api_key_crypto'
import { INTEGRATION_NOTIFY_ERROR } from '#lib/integrations/notifier_mapping'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import type { MetaGraphClient } from '#lib/meta_whatsapp/graph_client'
import { ApiKeyRepository } from '#repositories/api_key_repository'
import { IntegrationEventRepository } from '#repositories/integration_event_repository'
import { DeterministicCommerceNotifier } from '#services/integrations/deterministic_commerce_notifier'
import { IntegrationEventsRecoveryService } from '#services/integrations/integration_events_recovery_service'
import { IntegrationRecipientService } from '#services/integrations/integration_recipient_service'
import { createIntegrationEventsRecoveryHandler } from '#services/job_queue/handlers/integration_events_recovery_handler'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import NullJobQueueDriver from '#services/job_queue/drivers/null_driver'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { runWithTenant } from '#services/tenant_context'
import { WhatsappWebhookRepository } from '#repositories/whatsapp_webhook_repository'
import WhatsappOutboundService from '#services/whatsapp_outbound_service'

async function createOrg() {
  const id = randomUUID()
  const slug = `int-ntf-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Integrations notifier ${slug}`,
      slug,
      email: `${slug}@example.com`,
      country: 'IN',
      timezone: 'UTC',
      currency: 'INR',
      status: 'active',
    })
    .returning(['id'])
  return row.id as string
}

async function seedKey(organizationId: string) {
  const generated = generateApiKey()
  const row = await runWithTenant(organizationId, async () => {
    return new ApiKeyRepository().insert({
      organizationId,
      name: 'Notifier',
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      scopes: ['events:write'],
    })
  })
  return { ...generated, id: row.id }
}

async function seedConnectedConfig(organizationId: string) {
  return runWithTenant(organizationId, async () => {
    const [config] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId,
        phoneNumberId: `pn-ntf-${randomUUID().slice(0, 8)}`,
        wabaId: 'waba-ntf',
        accessToken: encryptWhatsappAccessToken('plain-token-ntf'),
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id'])
    return config.id as string
  })
}

async function seedCodTemplate(organizationId: string, whatsappConfigId: string | null) {
  return runWithTenant(organizationId, async () => {
    const [row] = await db
      .table('message_templates')
      .insert({
        organizationId,
        whatsappConfigId,
        name: 'shopenup_cod_to_prepaid',
        category: 'UTILITY',
        language: 'en_US',
        headerType: 'none',
        bodyText: 'Hi {{customer_name}}, pay {{order_id}}',
        parameterSchema: {
          headerNames: [],
          bodyNames: ['customer_name', 'order_id'],
          urlButtons: [{ name: 'cta_url', index: 0 }],
          sendable: true,
        },
        status: 'approved',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning(['id'])
    return row.id as string
  })
}

async function seedHelloWorldTemplate(organizationId: string, whatsappConfigId: string | null) {
  return runWithTenant(organizationId, async () => {
    const [row] = await db
      .table('message_templates')
      .insert({
        organizationId,
        whatsappConfigId,
        name: 'hello_world',
        category: 'UTILITY',
        language: 'en_US',
        headerType: 'text',
        bodyText:
          'Welcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API.',
        parameterSchema: {
          headerNames: [],
          bodyNames: [],
          sendable: true,
        },
        status: 'approved',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning(['id'])
    return row.id as string
  })
}

function fakeGraph(): MetaGraphClient {
  return {
    exchangeEmbeddedSignupCode: async () => ({ accessToken: 'x' }),
    subscribeAppToWaba: async () => {},
    registerPhoneNumber: async () => {},
    getPhoneNumber: async () => ({ id: '1' }),
    sendTextMessage: async () => ({ messageId: 'wamid.out.text', raw: {} }),
    sendTemplateMessage: async () => ({ messageId: 'wamid.out.tpl', raw: {} }),
    sendMediaMessage: async () => ({ messageId: 'wamid.out.media', raw: {} }),
  } as MetaGraphClient
}

async function nullQueueDriver(): Promise<NullJobQueueDriver> {
  const manager = await app.container.make(JobQueueManager)
  const driver = await manager.ensureStarted()
  if (!(driver instanceof NullJobQueueDriver)) {
    throw new Error(`Expected NullJobQueueDriver, got ${driver.constructor.name}`)
  }
  return driver
}

function notifier(templateFallbackName: string | null = null) {
  return new DeterministicCommerceNotifier(
    new IntegrationEventRepository(),
    new IntegrationRecipientService(),
    new WhatsappOutboundService(fakeGraph()),
    new WhatsappWebhookRepository(),
    templateFallbackName
  )
}

test.group('Deterministic commerce notifier', (group) => {
  const orgIds: string[] = []

  group.each.setup(async () => {
    const driver = await nullQueueDriver()
    driver.clearEnqueued()
  })

  group.each.teardown(async () => {
    while (orgIds.length > 0) {
      const organizationId = orgIds.pop()
      if (organizationId) {
        await runWithTenant(organizationId, async () => {
          await db.from('organizations').where('id', organizationId).delete()
        })
      }
    }
  })

  test('missing template fails the ledger and still returns HTTP 200', async ({
    client,
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const key = await seedKey(organizationId)

    const response = await client
      .post('/api/v1/integrations/shopenup/events')
      .header('Authorization', `Bearer ${key.rawToken}`)
      .json({
        eventType: 'order.placed',
        data: {
          orderId: 'ord_no_tpl',
          isCod: true,
          customerPhone: '+919111111111',
          customerName: 'Ada',
        },
      })
    response.assertStatus(200)
    assert.equal(response.body().data.status, 'accepted')

    const row = await runWithTenant(organizationId, async () => {
      return db.from('integration_events').where('organizationId', organizationId).first()
    })
    assert.equal(row.status, 'failed')
    assert.equal(row.errorCode, INTEGRATION_NOTIFY_ERROR.TEMPLATE_NOT_READY)
  })

  test('missing phone fails the ledger', async ({ client, assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const key = await seedKey(organizationId)

    const response = await client
      .post('/api/v1/integrations/shopenup/events')
      .header('Authorization', `Bearer ${key.rawToken}`)
      .json({
        eventType: 'order.placed',
        data: { orderId: 'ord_no_phone', isCod: true },
      })
    response.assertStatus(200)

    const row = await runWithTenant(organizationId, async () => {
      return db.from('integration_events').where('organizationId', organizationId).first()
    })
    assert.equal(row.status, 'failed')
    assert.equal(row.errorCode, INTEGRATION_NOTIFY_ERROR.MISSING_PHONE)
  })

  test('crm.contact_upserted upserts a contact without sending a template', async ({
    client,
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const key = await seedKey(organizationId)

    const response = await client
      .post('/api/v1/integrations/events')
      .header('Authorization', `Bearer ${key.rawToken}`)
      .json({
        externalEventId: 'crm_ada',
        type: 'crm.contact_upserted',
        occurredAt: '2026-08-17T12:00:00.000Z',
        payload: { phone: '+919666611111', name: 'Ada' },
      })
    response.assertStatus(200)

    await runWithTenant(organizationId, async () => {
      const row = await db
        .from('integration_events')
        .where('organizationId', organizationId)
        .first()
      assert.equal(row.status, 'processed')
      const contact = await db.from('contacts').where('organizationId', organizationId).first()
      assert.equal(contact.phoneNormalized, '919666611111')
      const messages = await db.from('messages').where('organizationId', organizationId)
      assert.lengthOf(messages, 0)
    })
  })

  test('approved template without WhatsApp config fails the ledger', async ({ client, assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const key = await seedKey(organizationId)
    await seedCodTemplate(organizationId, null)

    const response = await client
      .post('/api/v1/integrations/shopenup/events')
      .header('Authorization', `Bearer ${key.rawToken}`)
      .json({
        eventType: 'order.placed',
        data: {
          orderId: 'ord_no_wa',
          isCod: true,
          customerPhone: '+919555511111',
          customerName: 'Ada',
          cta_url: 'pay-ord-no-wa',
        },
      })
    response.assertStatus(200)

    const row = await runWithTenant(organizationId, async () => {
      return db.from('integration_events').where('organizationId', organizationId).first()
    })
    assert.equal(row.status, 'failed')
    assert.equal(row.errorCode, INTEGRATION_NOTIFY_ERROR.CONFIG_NOT_CONNECTED)
  })

  test('queues a system-channel template and is idempotent on replay', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const whatsappConfigId = await seedConnectedConfig(organizationId)
    await seedCodTemplate(organizationId, whatsappConfigId)

    const eventId = randomUUID()
    await runWithTenant(organizationId, async () => {
      await db.table('integration_events').insert({
        id: eventId,
        organizationId,
        provider: 'shopenup',
        externalEventId: 'ord_cod_1',
        eventType: 'commerce.order_placed',
        payload: {
          occurredAt: '2026-08-17T12:00:00.000Z',
          subject: { phone: '+919999911111', externalOrderId: 'ord_cod_1' },
          data: {
            orderId: 'ord_cod_1',
            customerName: 'Ada',
            customerPhone: '+919999911111',
            cta_url: 'pay-ord-cod-1',
          },
        },
        status: 'accepted',
      })
    })

    const payload = {
      integrationEventId: eventId,
      organizationId,
      provider: 'shopenup' as const,
      externalEventId: 'ord_cod_1',
      type: 'commerce.order_placed' as const,
      occurredAt: '2026-08-17T12:00:00.000Z',
      subject: { phone: '+919999911111', externalOrderId: 'ord_cod_1' },
      payload: {
        orderId: 'ord_cod_1',
        customerName: 'Ada',
        customerPhone: '+919999911111',
        cta_url: 'pay-ord-cod-1',
      },
    }

    const service = notifier()
    await service.handle(payload)
    await service.handle(payload)

    await runWithTenant(organizationId, async () => {
      const row = await db.from('integration_events').where('id', eventId).first()
      assert.equal(row.status, 'processed')

      const messages = await db.from('messages').where('organizationId', organizationId)
      assert.lengthOf(messages, 1)
      assert.equal(messages[0].senderType, 'system')
      assert.equal(messages[0].clientIdempotencyKey, eventId)

      const dispatch = await db
        .from('outbound_dispatches')
        .where('organizationId', organizationId)
        .first()
      const queued =
        typeof dispatch.payload === 'string' ? JSON.parse(dispatch.payload) : dispatch.payload
      assert.equal(queued.kind, 'template')
      assert.equal(queued.templateName, 'shopenup_cod_to_prepaid')
      assert.deepEqual(queued.components[0], {
        type: 'body',
        parameters: [
          { type: 'text', parameter_name: 'customer_name', text: 'Ada' },
          { type: 'text', parameter_name: 'order_id', text: 'ord_cod_1' },
        ],
      })
    })
  })

  test('falls back to hello_world when the mapped template is missing', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const whatsappConfigId = await seedConnectedConfig(organizationId)
    await seedHelloWorldTemplate(organizationId, whatsappConfigId)

    const eventId = randomUUID()
    await runWithTenant(organizationId, async () => {
      await db.table('integration_events').insert({
        id: eventId,
        organizationId,
        provider: 'shopenup',
        externalEventId: 'ord_fallback',
        eventType: 'commerce.order_placed',
        payload: {
          occurredAt: '2026-08-17T12:00:00.000Z',
          subject: { phone: '+919444411111', externalOrderId: 'ord_fallback' },
          data: {
            orderId: 'ord_fallback',
            customerName: 'Ada',
            customerPhone: '+919444411111',
          },
        },
        status: 'accepted',
      })
    })

    await notifier('hello_world').handle({
      integrationEventId: eventId,
      organizationId,
      provider: 'shopenup',
      externalEventId: 'ord_fallback',
      type: 'commerce.order_placed',
      occurredAt: '2026-08-17T12:00:00.000Z',
      subject: { phone: '+919444411111', externalOrderId: 'ord_fallback' },
      payload: {
        orderId: 'ord_fallback',
        customerName: 'Ada',
        customerPhone: '+919444411111',
      },
    })

    await runWithTenant(organizationId, async () => {
      const row = await db.from('integration_events').where('id', eventId).first()
      assert.equal(row.status, 'processed')

      const dispatch = await db
        .from('outbound_dispatches')
        .where('organizationId', organizationId)
        .first()
      const queued =
        typeof dispatch.payload === 'string' ? JSON.parse(dispatch.payload) : dispatch.payload
      assert.equal(queued.templateName, 'hello_world')
      assert.deepEqual(queued.components, [])
    })
  })

  test('mapped template wins even when a fallback name is configured', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const whatsappConfigId = await seedConnectedConfig(organizationId)
    await seedCodTemplate(organizationId, whatsappConfigId)
    await seedHelloWorldTemplate(organizationId, whatsappConfigId)

    const eventId = randomUUID()
    await runWithTenant(organizationId, async () => {
      await db.table('integration_events').insert({
        id: eventId,
        organizationId,
        provider: 'shopenup',
        externalEventId: 'ord_preferred',
        eventType: 'commerce.order_placed',
        payload: {
          occurredAt: '2026-08-17T12:00:00.000Z',
          subject: { phone: '+919333311111', externalOrderId: 'ord_preferred' },
          data: {
            orderId: 'ord_preferred',
            customerName: 'Ada',
            customerPhone: '+919333311111',
            cta_url: 'pay-ord-preferred',
          },
        },
        status: 'accepted',
      })
    })

    await notifier('hello_world').handle({
      integrationEventId: eventId,
      organizationId,
      provider: 'shopenup',
      externalEventId: 'ord_preferred',
      type: 'commerce.order_placed',
      occurredAt: '2026-08-17T12:00:00.000Z',
      subject: { phone: '+919333311111', externalOrderId: 'ord_preferred' },
      payload: {
        orderId: 'ord_preferred',
        customerName: 'Ada',
        customerPhone: '+919333311111',
        cta_url: 'pay-ord-preferred',
      },
    })

    await runWithTenant(organizationId, async () => {
      const row = await db.from('integration_events').where('id', eventId).first()
      assert.equal(row.status, 'processed')

      const dispatch = await db
        .from('outbound_dispatches')
        .where('organizationId', organizationId)
        .first()
      const queued =
        typeof dispatch.payload === 'string' ? JSON.parse(dispatch.payload) : dispatch.payload
      assert.equal(queued.templateName, 'shopenup_cod_to_prepaid')
    })
  })

  test('duplicate ingress does not queue twice', async ({ client, assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const key = await seedKey(organizationId)
    const whatsappConfigId = await seedConnectedConfig(organizationId)
    await seedCodTemplate(organizationId, whatsappConfigId)

    const body = {
      eventType: 'order.placed',
      data: {
        orderId: 'ord_dup',
        isCod: true,
        customerPhone: '+919888811111',
        customerName: 'Ada',
        cta_url: 'pay-ord-dup',
      },
    }

    const first = await client
      .post('/api/v1/integrations/shopenup/events')
      .header('Authorization', `Bearer ${key.rawToken}`)
      .json(body)
    first.assertStatus(200)
    const eventId = first.body().data.eventId as string

    const second = await client
      .post('/api/v1/integrations/shopenup/events')
      .header('Authorization', `Bearer ${key.rawToken}`)
      .json(body)
    second.assertStatus(200)
    assert.equal(second.body().data.eventId, eventId)

    await runWithTenant(organizationId, async () => {
      const row = await db.from('integration_events').where('id', eventId).first()
      assert.equal(row.status, 'processed')
      const messages = await db.from('messages').where('organizationId', organizationId)
      assert.lengthOf(messages, 1)
      assert.equal(messages[0].senderType, 'system')
    })
  })

  test('recovery re-emits stale accepted events', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const whatsappConfigId = await seedConnectedConfig(organizationId)
    await seedCodTemplate(organizationId, whatsappConfigId)

    const eventId = randomUUID()
    await runWithTenant(organizationId, async () => {
      await db.table('integration_events').insert({
        id: eventId,
        organizationId,
        provider: 'shopenup',
        externalEventId: 'ord_stale',
        eventType: 'commerce.order_placed',
        payload: {
          occurredAt: '2026-08-17T12:00:00.000Z',
          subject: { phone: '+919777711111', externalOrderId: 'ord_stale' },
          data: {
            orderId: 'ord_stale',
            customerName: 'Ada',
            customerPhone: '+919777711111',
            cta_url: 'pay-ord-stale',
          },
        },
        status: 'accepted',
        receivedAt: new Date(Date.now() - 2 * 60_000),
      })
    })

    const handler = createIntegrationEventsRecoveryHandler(new IntegrationEventsRecoveryService())
    await handler({
      id: 'job-int-recovery',
      name: JOB_NAMES.INTEGRATION_EVENTS_RECOVERY,
      data: { limit: 50 },
    })

    await runWithTenant(organizationId, async () => {
      const row = await db.from('integration_events').where('id', eventId).first()
      assert.equal(row.status, 'processed')
      const messages = await db.from('messages').where('organizationId', organizationId)
      assert.lengthOf(messages, 1)
      assert.equal(messages[0].senderType, 'system')
    })
  })
})
