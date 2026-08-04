import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import WhatsappOutboundException from '#exceptions/whatsapp_outbound_exception'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import { MetaGraphApiError, type MetaGraphClient } from '#lib/meta_whatsapp/graph_client'
import { OUTBOUND_MAX_ATTEMPTS } from '#lib/meta_whatsapp/outbound_retry'
import NullJobQueueDriver from '#services/job_queue/drivers/null_driver'
import { createWhatsappOutboundDispatchHandler } from '#services/job_queue/handlers/whatsapp_outbound_dispatch_handler'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { WhatsappConfigService } from '#services/whatsapp_config_service'
import WhatsappOutboundService from '#services/whatsapp_outbound_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `wa-out-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `WA Out ${slug}`,
      slug,
      email: `${slug}@example.com`,
      country: 'US',
      timezone: 'UTC',
      currency: 'USD',
      status: true,
    })
    .returning(['id'])
  return row.id as string
}

async function seedConversation(
  organizationId: string,
  params?: { configStatus?: string; contactPhone?: string }
) {
  return runWithTenant(organizationId, async () => {
    const [config] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId,
        phoneNumberId: `pn-out-${randomUUID().slice(0, 8)}`,
        wabaId: 'waba-out',
        accessToken: encryptWhatsappAccessToken('plain-token-out'),
        status: params?.configStatus ?? 'connected',
        connectedAt: new Date(),
      })
      .returning(['id', 'phoneNumberId'])

    const phone = params?.contactPhone ?? '15551234999'
    const [contact] = await db
      .table('contacts')
      .insert({
        organizationId,
        phone,
        phoneNormalized: phone.replace(/\D/g, ''),
        name: 'Outbound To',
        customFields: {},
      })
      .returning(['id'])

    const [conversation] = await db
      .table('conversations')
      .insert({
        organizationId,
        whatsappConfigId: config.id,
        contactId: contact.id,
        status: 'open',
        unreadCount: 0,
      })
      .returning(['id'])

    return {
      whatsappConfigId: config.id as string,
      conversationId: conversation.id as string,
    }
  })
}

async function seedApprovedTemplate(
  organizationId: string,
  whatsappConfigId: string,
  overrides?: Partial<{
    status: string
    bodyText: string
    parameterSchema: Record<string, unknown>
    name: string
  }>
) {
  return runWithTenant(organizationId, async () => {
    const [row] = await db
      .table('message_templates')
      .insert({
        organizationId,
        whatsappConfigId,
        name: overrides?.name ?? `tpl_${randomUUID().slice(0, 8)}`,
        category: 'UTILITY',
        language: 'en_US',
        headerType: 'none',
        bodyText: overrides?.bodyText ?? 'Hello {{name}}',
        parameterSchema: overrides?.parameterSchema ?? {
          headerNames: [],
          bodyNames: ['name'],
          sendable: true,
        },
        status: overrides?.status ?? 'approved',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning(['id', 'name'])
    return row as { id: string; name: string }
  })
}

function fakeGraph(overrides: Partial<MetaGraphClient> = {}): MetaGraphClient {
  return {
    exchangeEmbeddedSignupCode: async () => ({ accessToken: 'x' }),
    subscribeAppToWaba: async () => {},
    registerPhoneNumber: async () => {},
    getPhoneNumber: async () => ({ id: '1' }),
    sendTextMessage: async () => ({ messageId: 'wamid.out.text', raw: {} }),
    sendTemplateMessage: async () => ({ messageId: 'wamid.out.tpl', raw: {} }),
    ...overrides,
  }
}

async function nullQueueDriver(): Promise<NullJobQueueDriver> {
  const manager = await app.container.make(JobQueueManager)
  const driver = await manager.ensureStarted()
  if (!(driver instanceof NullJobQueueDriver)) {
    throw new Error(`Expected NullJobQueueDriver, got ${driver.constructor.name}`)
  }
  return driver
}

test.group('WhatsApp outbound service', (group) => {
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

  test('queueText creates queued message and pending dispatch', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const service = new WhatsappOutboundService(fakeGraph())

    const queued = await service.queueText({
      organizationId,
      conversationId: seeded.conversationId,
      text: 'Hello outbound',
      actorUserId: null,
    })

    await runWithTenant(organizationId, async () => {
      const message = await db
        .from('messages')
        .where('organizationId', organizationId)
        .where('id', queued.messageId)
        .first()
      const dispatch = await db
        .from('outbound_dispatches')
        .where('organizationId', organizationId)
        .where('id', queued.dispatchId)
        .first()

      assert.equal(message.status, 'queued')
      assert.equal(message.senderType, 'system')
      assert.equal(message.contentText, 'Hello outbound')
      assert.equal(dispatch.status, 'pending')
      assert.equal(dispatch.attempts, 0)
      assert.equal(dispatch.payload.kind, 'text')
      assert.equal(dispatch.payload.to, '15551234999')
    })
  })

  test('queueText enqueues a worker wake job on the null driver', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const service = new WhatsappOutboundService(fakeGraph())
    const queue = await nullQueueDriver()

    const queued = await service.queueText({
      organizationId,
      conversationId: seeded.conversationId,
      text: 'Wake worker',
    })

    const jobs = queue.enqueued.filter((j) => j.data.dispatchId === queued.dispatchId)
    assert.lengthOf(jobs, 1)
    assert.equal(jobs[0].name, JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH)
    assert.deepEqual(jobs[0].data, {
      organizationId,
      dispatchId: queued.dispatchId,
    })
    assert.equal(jobs[0].options?.singletonKey, queued.dispatchId)
    assert.isUndefined(jobs[0].options?.runAt)
  })

  test('worker handler executes dispatch using job lock owner', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const service = new WhatsappOutboundService(fakeGraph())

    const queued = await service.queueText({
      organizationId,
      conversationId: seeded.conversationId,
      text: 'Via handler',
    })

    const handler = createWhatsappOutboundDispatchHandler(service)
    await handler({
      id: 'job-handler-1',
      name: JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH,
      data: { organizationId, dispatchId: queued.dispatchId },
    })

    await runWithTenant(organizationId, async () => {
      const message = await db
        .from('messages')
        .where('organizationId', organizationId)
        .where('id', queued.messageId)
        .first()
      assert.equal(message.status, 'sent')
      assert.equal(message.providerMessageId, 'wamid.out.text')
    })
  })

  test('executeDispatch claims, sends, and marks sent with wamid', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const service = new WhatsappOutboundService(fakeGraph())

    const queued = await service.queueText({
      organizationId,
      conversationId: seeded.conversationId,
      text: 'Send me',
    })

    const result = await service.executeDispatch({
      organizationId,
      dispatchId: queued.dispatchId,
      lockOwner: 'test-worker-1',
    })

    assert.equal(result.outcome, 'sent')
    if (result.outcome === 'sent') {
      assert.equal(result.providerMessageId, 'wamid.out.text')
    }

    await runWithTenant(organizationId, async () => {
      const message = await db
        .from('messages')
        .where('organizationId', organizationId)
        .where('id', queued.messageId)
        .first()
      const dispatch = await db
        .from('outbound_dispatches')
        .where('organizationId', organizationId)
        .where('id', queued.dispatchId)
        .first()
      assert.equal(message.status, 'sent')
      assert.equal(message.providerMessageId, 'wamid.out.text')
      assert.isNotNull(message.sentAt)
      assert.equal(dispatch.status, 'sent')
      assert.isNull(dispatch.lockOwner)
    })

    const again = await service.executeDispatch({
      organizationId,
      dispatchId: queued.dispatchId,
      lockOwner: 'test-worker-2',
    })
    assert.equal(again.outcome, 'already_sent')
  })

  test('active lease returns not_claimed; expired lease recovers', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const service = new WhatsappOutboundService(fakeGraph())

    const queued = await service.queueText({
      organizationId,
      conversationId: seeded.conversationId,
      text: 'Lease me',
    })

    await runWithTenant(organizationId, async () => {
      await db
        .from('outbound_dispatches')
        .where('id', queued.dispatchId)
        .update({
          status: 'processing',
          attempts: 1,
          lockOwner: 'holder-a',
          lockedAt: new Date(),
          lockExpiresAt: new Date(Date.now() + 5 * 60_000),
        })
    })

    const blocked = await service.executeDispatch({
      organizationId,
      dispatchId: queued.dispatchId,
      lockOwner: 'holder-b',
    })
    assert.equal(blocked.outcome, 'not_claimed')

    await runWithTenant(organizationId, async () => {
      await db
        .from('outbound_dispatches')
        .where('id', queued.dispatchId)
        .update({
          lockExpiresAt: new Date(Date.now() - 60_000),
        })
    })

    const recovered = await service.executeDispatch({
      organizationId,
      dispatchId: queued.dispatchId,
      lockOwner: 'holder-b',
    })
    assert.equal(recovered.outcome, 'sent')
  })

  test('retryable Meta failure schedules retry, keeps message queued, and enqueues delayed wake', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const queue = await nullQueueDriver()
    const service = new WhatsappOutboundService(
      fakeGraph({
        sendTextMessage: async () => {
          throw new MetaGraphApiError('rate limited', 429, null, 'sendText')
        },
      })
    )

    const queued = await service.queueText({
      organizationId,
      conversationId: seeded.conversationId,
      text: 'Retry me',
    })
    queue.clearEnqueued()

    const result = await service.executeDispatch({
      organizationId,
      dispatchId: queued.dispatchId,
      lockOwner: 'test-worker-1',
    })

    assert.equal(result.outcome, 'retry_scheduled')

    await runWithTenant(organizationId, async () => {
      const message = await db
        .from('messages')
        .where('organizationId', organizationId)
        .where('id', queued.messageId)
        .first()
      const dispatch = await db
        .from('outbound_dispatches')
        .where('organizationId', organizationId)
        .where('id', queued.dispatchId)
        .first()
      assert.equal(message.status, 'queued')
      assert.equal(dispatch.status, 'retry_scheduled')
      assert.equal(dispatch.attempts, 1)
      assert.isNotNull(dispatch.nextAttemptAt)
      assert.isNull(dispatch.lockOwner)
    })

    const wakeJobs = queue.enqueued.filter((j) => j.data.dispatchId === queued.dispatchId)
    assert.lengthOf(wakeJobs, 1)
    assert.instanceOf(wakeJobs[0].options?.runAt, Date)
  })

  test('fifth retryable failure becomes terminal failed', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const service = new WhatsappOutboundService(
      fakeGraph({
        sendTextMessage: async () => {
          throw new MetaGraphApiError('still limited', 429, null, 'sendText')
        },
      })
    )

    const queued = await service.queueText({
      organizationId,
      conversationId: seeded.conversationId,
      text: 'Fifth fail',
    })

    await runWithTenant(organizationId, async () => {
      await db
        .from('outbound_dispatches')
        .where('id', queued.dispatchId)
        .update({
          status: 'retry_scheduled',
          attempts: OUTBOUND_MAX_ATTEMPTS - 1,
          nextAttemptAt: new Date(Date.now() - 1000),
          lockOwner: null,
          lockedAt: null,
          lockExpiresAt: null,
        })
    })

    const result = await service.executeDispatch({
      organizationId,
      dispatchId: queued.dispatchId,
      lockOwner: 'test-worker-5',
    })

    assert.equal(result.outcome, 'failed')
    assert.equal(OUTBOUND_MAX_ATTEMPTS, 5)

    await runWithTenant(organizationId, async () => {
      const message = await db
        .from('messages')
        .where('organizationId', organizationId)
        .where('id', queued.messageId)
        .first()
      const dispatch = await db
        .from('outbound_dispatches')
        .where('organizationId', organizationId)
        .where('id', queued.dispatchId)
        .first()
      assert.equal(message.status, 'failed')
      assert.equal(dispatch.status, 'failed')
      assert.equal(dispatch.attempts, OUTBOUND_MAX_ATTEMPTS)
      assert.isNotNull(message.failedAt)
    })
  })

  test('terminal Meta 400 fails dispatch without retry enqueue', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const queue = await nullQueueDriver()
    const service = new WhatsappOutboundService(
      fakeGraph({
        sendTextMessage: async () => {
          throw new MetaGraphApiError('bad request', 400, null, 'sendText')
        },
      })
    )

    const queued = await service.queueText({
      organizationId,
      conversationId: seeded.conversationId,
      text: 'Bad',
    })
    queue.clearEnqueued()

    const result = await service.executeDispatch({
      organizationId,
      dispatchId: queued.dispatchId,
      lockOwner: 'test-worker-1',
    })

    assert.equal(result.outcome, 'failed')
    assert.lengthOf(
      queue.enqueued.filter((j) => j.data.dispatchId === queued.dispatchId),
      0
    )
  })

  test('reconciles unmatched early receipt after successful send', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)

    await runWithTenant(organizationId, async () => {
      await db.table('unmatched_provider_receipts').insert({
        organizationId,
        whatsappConfigId: seeded.whatsappConfigId,
        providerMessageId: 'wamid.out.text',
        status: 'delivered',
        providerStatusAt: new Date('2024-06-01T00:02:00.000Z'),
        errorMessage: null,
        metadata: {},
      })
    })

    const service = new WhatsappOutboundService(fakeGraph())
    const queued = await service.queueText({
      organizationId,
      conversationId: seeded.conversationId,
      text: 'Early receipt',
    })

    const result = await service.executeDispatch({
      organizationId,
      dispatchId: queued.dispatchId,
      lockOwner: 'test-worker-1',
    })

    assert.equal(result.outcome, 'sent')

    await runWithTenant(organizationId, async () => {
      const message = await db
        .from('messages')
        .where('organizationId', organizationId)
        .where('id', queued.messageId)
        .first()
      const unmatched = await db
        .from('unmatched_provider_receipts')
        .where('organizationId', organizationId)
        .where('providerMessageId', 'wamid.out.text')
      assert.equal(message.status, 'delivered')
      assert.isNotNull(message.deliveredAt)
      assert.lengthOf(unmatched, 0)
    })
  })

  test('rejects missing conversation and disconnected config', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const disconnected = await seedConversation(organizationId, { configStatus: 'disconnected' })
    const service = new WhatsappOutboundService(fakeGraph())

    try {
      await service.queueText({
        organizationId,
        conversationId: randomUUID(),
        text: 'Nope',
      })
      assert.fail('expected conversation not found')
    } catch (error) {
      assert.instanceOf(error, WhatsappOutboundException)
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_CONVERSATION_NOT_FOUND')
    }

    try {
      await service.queueText({
        organizationId,
        conversationId: disconnected.conversationId,
        text: 'Nope',
      })
      assert.fail('expected config not connected')
    } catch (error) {
      assert.instanceOf(error, WhatsappOutboundException)
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_CONFIG_NOT_CONNECTED')
    }
  })

  test('queueTemplate validates approval, schema, and parameters', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const service = new WhatsappOutboundService(fakeGraph())

    const draft = await seedApprovedTemplate(organizationId, seeded.whatsappConfigId, {
      status: 'pending',
      name: 'draft_tpl',
    })
    try {
      await service.queueTemplate({
        organizationId,
        conversationId: seeded.conversationId,
        templateId: draft.id,
        parameters: { name: 'Ada' },
      })
      assert.fail('expected not approved')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_TEMPLATE_NOT_APPROVED')
    }

    const numbered = await seedApprovedTemplate(organizationId, seeded.whatsappConfigId, {
      name: 'numbered_tpl',
      bodyText: 'Hello {{1}}',
      parameterSchema: {
        headerNames: [],
        bodyNames: [],
        sendable: false,
        unsupportedReason: 'Numbered placeholders',
      },
    })
    try {
      await service.queueTemplate({
        organizationId,
        conversationId: seeded.conversationId,
        templateId: numbered.id,
        parameters: {},
      })
      assert.fail('expected not sendable')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_TEMPLATE_NOT_SENDABLE')
    }

    const approved = await seedApprovedTemplate(organizationId, seeded.whatsappConfigId, {
      name: 'ok_tpl',
    })
    try {
      await service.queueTemplate({
        organizationId,
        conversationId: seeded.conversationId,
        templateId: approved.id,
        parameters: {},
      })
      assert.fail('expected missing params')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_TEMPLATE_PARAMS')
    }

    const queued = await service.queueTemplate({
      organizationId,
      conversationId: seeded.conversationId,
      templateId: approved.id,
      parameters: { name: 'Ada' },
    })

    await runWithTenant(organizationId, async () => {
      const dispatch = await db
        .from('outbound_dispatches')
        .where('organizationId', organizationId)
        .where('id', queued.dispatchId)
        .first()
      assert.equal(dispatch.payload.kind, 'template')
      assert.equal(dispatch.payload.templateName, approved.name)
      assert.lengthOf(dispatch.payload.components, 1)
    })
  })

  test('isolates tenants — cannot queue against another org conversation', async ({ assert }) => {
    const orgA = await createOrg()
    const orgB = await createOrg()
    orgIds.push(orgA, orgB)
    const seededB = await seedConversation(orgB)
    const service = new WhatsappOutboundService(fakeGraph())

    try {
      await service.queueText({
        organizationId: orgA,
        conversationId: seededB.conversationId,
        text: 'Cross tenant',
      })
      assert.fail('expected cross-tenant rejection')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_CONVERSATION_NOT_FOUND')
    }
  })

  test('config test-send remains persistence-free', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const configs = new WhatsappConfigService(fakeGraph())

    const before = await runWithTenant(organizationId, async () => {
      return {
        messages: await db
          .from('messages')
          .where('organizationId', organizationId)
          .count('* as total')
          .first(),
        dispatches: await db
          .from('outbound_dispatches')
          .where('organizationId', organizationId)
          .count('* as total')
          .first(),
      }
    })

    const result = await runWithTenant(organizationId, async () => {
      return configs.sendTestTemplate({
        configId: seeded.whatsappConfigId,
        to: '15551234999',
      })
    })

    assert.equal(result.messageId, 'wamid.out.tpl')

    await runWithTenant(organizationId, async () => {
      const messages = await db
        .from('messages')
        .where('organizationId', organizationId)
        .count('* as total')
        .first()
      const dispatches = await db
        .from('outbound_dispatches')
        .where('organizationId', organizationId)
        .count('* as total')
        .first()
      assert.equal(Number(messages?.total ?? 0), Number(before.messages?.total ?? 0))
      assert.equal(Number(dispatches?.total ?? 0), Number(before.dispatches?.total ?? 0))
    })
  })
})
