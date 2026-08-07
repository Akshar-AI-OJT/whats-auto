import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import InboxStatusUpdated from '#events/inbox_status_updated'
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
  params?: {
    configStatus?: string
    contactPhone?: string
    conversationStatus?: string
    withInboundWithinWindow?: boolean
    inboundCreatedAt?: Date
  }
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
        status: params?.conversationStatus ?? 'open',
        unreadCount: 0,
      })
      .returning(['id'])

    const withInbound = params?.withInboundWithinWindow !== false
    if (withInbound) {
      const createdAt = params?.inboundCreatedAt ?? new Date()
      await db.table('messages').insert({
        organizationId,
        conversationId: conversation.id,
        senderType: 'contact',
        senderId: null,
        contentType: 'text',
        contentText: 'inbound hi',
        status: 'delivered',
        occurredAt: createdAt,
        createdAt,
        updatedAt: createdAt,
        metadata: {},
      })
    }

    return {
      whatsappConfigId: config.id as string,
      conversationId: conversation.id as string,
      contactId: contact.id as string,
    }
  })
}

async function seedMediaAsset(
  organizationId: string,
  params?: Partial<{
    filePath: string
    mimeType: string
    fileSize: number
    fileName: string
    state: string
  }>
) {
  return runWithTenant(organizationId, async () => {
    const filePath = params?.filePath ?? 'https://media.test.local/media/photo.jpg'
    const [row] = await db
      .table('media_assets')
      .insert({
        organizationId,
        fileName: params?.fileName ?? 'photo.jpg',
        filePath,
        deliveryUrl: filePath,
        storageKey: `${organizationId}/upload/images/test/${crypto.randomUUID()}.jpg`,
        storageDisk: 's3',
        state: params?.state ?? 'ready',
        source: 'upload',
        mimeType: params?.mimeType ?? 'image/jpeg',
        fileSize: params?.fileSize ?? 1024,
        uploadedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning(['id'])
    return row.id as string
  })
}

async function seedApprovedTemplate(
  organizationId: string,
  whatsappConfigId: string,
  overrides?: Partial<{
    status: string
    bodyText: string
    headerType: string
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
        headerType: overrides?.headerType ?? 'none',
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
    sendMediaMessage: async () => ({ messageId: 'wamid.out.media', raw: {} }),
    ...overrides,
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

  test('InboxStatusUpdated failure after sent does not mark dispatch failed', async ({
    assert,
  }) => {
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

    const originalDispatch = InboxStatusUpdated.dispatch.bind(InboxStatusUpdated)
    InboxStatusUpdated.dispatch = (async () => {
      throw new Error('listener boom')
    }) as typeof InboxStatusUpdated.dispatch

    try {
      const service = new WhatsappOutboundService(fakeGraph())
      const queued = await service.queueText({
        organizationId,
        conversationId: seeded.conversationId,
        text: 'Event fail after send',
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
        const dispatch = await db
          .from('outbound_dispatches')
          .where('organizationId', organizationId)
          .where('id', queued.dispatchId)
          .first()
        assert.equal(message.status, 'delivered')
        assert.equal(dispatch.status, 'sent')
      })
    } finally {
      InboxStatusUpdated.dispatch = originalDispatch
    }
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

  test('queueTemplate sends media-header templates with READY assets', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const service = new WhatsappOutboundService(fakeGraph())

    const mediaAssetId = await seedMediaAsset(organizationId, {
      filePath: 'https://media.test.local/media/banner.jpg',
      mimeType: 'image/jpeg',
      fileSize: 2048,
      fileName: 'banner.jpg',
    })

    const template = await seedApprovedTemplate(organizationId, seeded.whatsappConfigId, {
      name: 'promo_image',
      headerType: 'image',
      bodyText: 'Deal on {{sku}}',
      parameterSchema: {
        headerNames: [],
        bodyNames: ['sku'],
        sendable: true,
        headerMediaType: 'image',
      },
    })

    try {
      await service.queueTemplate({
        organizationId,
        conversationId: seeded.conversationId,
        templateId: template.id,
        parameters: { sku: 'A1' },
      })
      assert.fail('expected missing header media')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_TEMPLATE_PARAMS')
    }

    const wrongMime = await seedMediaAsset(organizationId, {
      filePath: 'https://media.test.local/media/clip.mp4',
      mimeType: 'video/mp4',
      fileSize: 2048,
      fileName: 'clip.mp4',
    })
    try {
      await service.queueTemplate({
        organizationId,
        conversationId: seeded.conversationId,
        templateId: template.id,
        parameters: { sku: 'A1' },
        headerMediaAssetId: wrongMime,
      })
      assert.fail('expected mime mismatch')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_MEDIA_MIME_TYPE')
    }

    const textOnly = await seedApprovedTemplate(organizationId, seeded.whatsappConfigId, {
      name: 'text_only_tpl',
      bodyText: 'Hi {{name}}',
    })
    try {
      await service.queueTemplate({
        organizationId,
        conversationId: seeded.conversationId,
        templateId: textOnly.id,
        parameters: { name: 'Ada' },
        headerMediaAssetId: mediaAssetId,
      })
      assert.fail('expected header media rejected')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_TEMPLATE_PARAMS')
    }

    const queued = await service.queueTemplate({
      organizationId,
      conversationId: seeded.conversationId,
      templateId: template.id,
      parameters: { sku: 'A1' },
      headerMediaAssetId: mediaAssetId,
    })

    await runWithTenant(organizationId, async () => {
      const dispatch = await db
        .from('outbound_dispatches')
        .where('organizationId', organizationId)
        .where('id', queued.dispatchId)
        .first()
      const payload =
        typeof dispatch?.payload === 'string'
          ? JSON.parse(dispatch.payload as string)
          : dispatch?.payload
      assert.equal(payload.kind, 'template')
      assert.deepEqual(payload.components[0], {
        type: 'header',
        parameters: [
          { type: 'image', image: { link: 'https://media.test.local/media/banner.jpg' } },
        ],
      })

      const message = await db
        .from('messages')
        .where('id', queued.messageId)
        .where('organizationId', organizationId)
        .first()
      assert.equal(message?.mediaAssetId, mediaAssetId)
      assert.equal(message?.mediaUrl, 'https://media.test.local/media/banner.jpg')
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
        organizationId,
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

  test('queueMedia validates mime, public URL, and file size', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const service = new WhatsappOutboundService(fakeGraph())

    const badMime = await seedMediaAsset(organizationId, {
      mimeType: 'image/gif',
      filePath: 'https://media.test.local/a.gif',
    })
    try {
      await service.queueMedia({
        organizationId,
        conversationId: seeded.conversationId,
        mediaType: 'image',
        mediaAssetId: badMime,
      })
      assert.fail('expected mime rejection')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_MEDIA_MIME_TYPE')
    }

    const privatePath = await seedMediaAsset(organizationId, {
      filePath: 's3://bucket/private.jpg',
      mimeType: 'image/jpeg',
    })
    try {
      await service.queueMedia({
        organizationId,
        conversationId: seeded.conversationId,
        mediaType: 'image',
        mediaAssetId: privatePath,
      })
      assert.fail('expected URL rejection')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_MEDIA_LINK_UNAVAILABLE')
    }

    const tooLarge = await seedMediaAsset(organizationId, {
      mimeType: 'image/jpeg',
      filePath: 'https://media.test.local/big.jpg',
      fileSize: 6 * 1024 * 1024,
    })
    try {
      await service.queueMedia({
        organizationId,
        conversationId: seeded.conversationId,
        mediaType: 'image',
        mediaAssetId: tooLarge,
      })
      assert.fail('expected size rejection')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_MEDIA_FILE_SIZE')
    }

    const ok = await seedMediaAsset(organizationId)
    const queued = await service.queueMedia({
      organizationId,
      conversationId: seeded.conversationId,
      mediaType: 'image',
      mediaAssetId: ok,
      caption: 'look',
    })

    await runWithTenant(organizationId, async () => {
      const message = await db.from('messages').where('id', queued.messageId).first()
      const dispatch = await db.from('outbound_dispatches').where('id', queued.dispatchId).first()
      assert.equal(message.status, 'queued')
      assert.equal(message.contentType, 'image')
      assert.equal(dispatch.payload.kind, 'media')
      assert.isNull(message.providerMessageId)
    })
  })

  test('queueMedia allows document for tenant and system channels', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const service = new WhatsappOutboundService(fakeGraph())
    const pdf = await seedMediaAsset(organizationId, {
      mimeType: 'application/pdf',
      filePath: 'https://media.test.local/invoice.pdf',
      fileName: 'invoice.pdf',
      fileSize: 2048,
    })

    const tenantQueued = await service.queueMedia({
      organizationId,
      conversationId: seeded.conversationId,
      mediaType: 'document',
      mediaAssetId: pdf,
      channel: 'tenant',
    })

    const systemQueued = await service.queueMedia({
      organizationId,
      conversationId: seeded.conversationId,
      mediaType: 'document',
      mediaAssetId: pdf,
      channel: 'system',
    })

    await runWithTenant(organizationId, async () => {
      const tenantMessage = await db.from('messages').where('id', tenantQueued.messageId).first()
      const systemMessage = await db.from('messages').where('id', systemQueued.messageId).first()
      assert.equal(tenantMessage.contentType, 'document')
      assert.equal(systemMessage.contentType, 'document')
    })
  })

  test('queueMedia registers protected media reference on send', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const service = new WhatsappOutboundService(fakeGraph())
    const assetId = await seedMediaAsset(organizationId, {
      mimeType: 'image/jpeg',
      filePath: 'https://media.test.local/attached.jpg',
      fileName: 'attached.jpg',
    })

    const queued = await service.queueMedia({
      organizationId,
      conversationId: seeded.conversationId,
      mediaType: 'image',
      mediaAssetId: assetId,
    })

    await runWithTenant(organizationId, async () => {
      const message = await db.from('messages').where('id', queued.messageId).first()
      const ref = await db
        .from('media_asset_references')
        .where('mediaAssetId', assetId)
        .where('ownerId', queued.messageId)
        .first()

      assert.equal(message.status, 'queued')
      assert.equal(ref.ownerType, 'message')
    })
  })

  test('rejects non-ready and cross-tenant media assets on queueMedia', async ({ assert }) => {
    const orgA = await createOrg()
    const orgB = await createOrg()
    orgIds.push(orgA, orgB)
    const seeded = await seedConversation(orgA)
    const service = new WhatsappOutboundService(fakeGraph())

    const pending = await seedMediaAsset(orgA, {
      state: 'pending_upload',
      filePath: 'https://media.test.local/pending.jpg',
    })
    try {
      await service.queueMedia({
        organizationId: orgA,
        conversationId: seeded.conversationId,
        mediaType: 'image',
        mediaAssetId: pending,
      })
      assert.fail('expected non-ready rejection')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_MEDIA_NOT_FOUND')
    }

    const foreign = await seedMediaAsset(orgB, {
      filePath: 'https://media.test.local/foreign.jpg',
    })
    try {
      await service.queueMedia({
        organizationId: orgA,
        conversationId: seeded.conversationId,
        mediaType: 'image',
        mediaAssetId: foreign,
      })
      assert.fail('expected cross-tenant media rejection')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_MEDIA_NOT_FOUND')
    }
  })

  test('queueTemplate document header works for tenant and system channels', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const service = new WhatsappOutboundService(fakeGraph())

    const pdf = await seedMediaAsset(organizationId, {
      mimeType: 'application/pdf',
      filePath: 'https://media.test.local/docs/invoice.pdf',
      fileName: 'invoice.pdf',
      fileSize: 4096,
    })

    const template = await seedApprovedTemplate(organizationId, seeded.whatsappConfigId, {
      name: 'invoice_doc',
      headerType: 'document',
      bodyText: 'Invoice {{id}}',
      parameterSchema: {
        headerNames: [],
        bodyNames: ['id'],
        sendable: true,
        headerMediaType: 'document',
      },
    })

    const tenantQueued = await service.queueTemplate({
      organizationId,
      conversationId: seeded.conversationId,
      templateId: template.id,
      parameters: { id: '41' },
      headerMediaAssetId: pdf,
      channel: 'tenant',
    })

    const queued = await service.queueTemplate({
      organizationId,
      conversationId: seeded.conversationId,
      templateId: template.id,
      parameters: { id: '42' },
      headerMediaAssetId: pdf,
      channel: 'system',
    })

    await runWithTenant(organizationId, async () => {
      const tenantMessage = await db.from('messages').where('id', tenantQueued.messageId).first()
      assert.equal(tenantMessage?.mediaAssetId, pdf)

      const dispatch = await db.from('outbound_dispatches').where('id', queued.dispatchId).first()
      const payload =
        typeof dispatch?.payload === 'string'
          ? JSON.parse(dispatch.payload as string)
          : dispatch?.payload
      assert.equal(payload.kind, 'template')
      assert.deepEqual(payload.components[0], {
        type: 'header',
        parameters: [
          {
            type: 'document',
            document: {
              link: 'https://media.test.local/docs/invoice.pdf',
              filename: 'invoice.pdf',
            },
          },
        ],
      })

      const message = await db.from('messages').where('id', queued.messageId).first()
      assert.equal(message?.mediaAssetId, pdf)
      assert.equal(message?.mediaUrl, 'https://media.test.local/docs/invoice.pdf')
    })
  })

  test('queueMedia idempotency replays same message and conflicts on change', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const agentId = randomUUID()
    await db.table('users').insert({
      id: agentId,
      name: 'Agent',
      firstname: 'Agent',
      lastname: 'User',
      email: `agent-${agentId.slice(0, 8)}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const service = new WhatsappOutboundService(fakeGraph())
    const mediaAssetId = await seedMediaAsset(organizationId)
    const key = `media-idem-${randomUUID()}`

    const first = await service.queueMedia({
      organizationId,
      conversationId: seeded.conversationId,
      mediaType: 'image',
      mediaAssetId,
      caption: 'once',
      actorUserId: agentId,
      idempotencyKey: key,
    })
    const second = await service.queueMedia({
      organizationId,
      conversationId: seeded.conversationId,
      mediaType: 'image',
      mediaAssetId,
      caption: 'once',
      actorUserId: agentId,
      idempotencyKey: key,
    })
    assert.equal(second.messageId, first.messageId)
    assert.equal(second.dispatchId, first.dispatchId)

    try {
      await service.queueMedia({
        organizationId,
        conversationId: seeded.conversationId,
        mediaType: 'image',
        mediaAssetId,
        caption: 'changed',
        actorUserId: agentId,
        idempotencyKey: key,
      })
      assert.fail('expected idempotency conflict')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_IDEMPOTENCY_KEY_CONFLICT')
    }
  })

  test('rejects text/media outside session window; templates still queue', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const expired = await seedConversation(organizationId, {
      withInboundWithinWindow: true,
      inboundCreatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    })
    const service = new WhatsappOutboundService(fakeGraph())

    try {
      await service.queueText({
        organizationId,
        conversationId: expired.conversationId,
        text: 'too late',
      })
      assert.fail('expected session window rejection')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_SESSION_WINDOW_EXPIRED')
    }

    const template = await seedApprovedTemplate(organizationId, expired.whatsappConfigId)
    const queued = await service.queueTemplate({
      organizationId,
      conversationId: expired.conversationId,
      templateId: template.id,
      parameters: { name: 'Ada' },
    })
    assert.isString(queued.messageId)
  })

  test('rejects closed conversation with E_OUTBOUND_CONVERSATION_CLOSED', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId, { conversationStatus: 'closed' })
    const service = new WhatsappOutboundService(fakeGraph())

    try {
      await service.queueText({
        organizationId,
        conversationId: seeded.conversationId,
        text: 'nope',
      })
      assert.fail('expected closed rejection')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_CONVERSATION_CLOSED')
    }
  })

  test('client idempotency returns same message and conflicts on payload change', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const agentId = randomUUID()
    await db.table('users').insert({
      id: agentId,
      name: 'Agent',
      firstname: 'Agent',
      lastname: 'User',
      email: `agent-${agentId.slice(0, 8)}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const service = new WhatsappOutboundService(fakeGraph())
    const key = `idem-${randomUUID()}`

    const first = await service.queueText({
      organizationId,
      conversationId: seeded.conversationId,
      text: 'Hello once',
      actorUserId: agentId,
      idempotencyKey: key,
    })
    const second = await service.queueText({
      organizationId,
      conversationId: seeded.conversationId,
      text: 'Hello once',
      actorUserId: agentId,
      idempotencyKey: key,
    })

    assert.equal(first.messageId, second.messageId)
    assert.equal(first.dispatchId, second.dispatchId)

    await runWithTenant(organizationId, async () => {
      const count = await db
        .from('outbound_dispatches')
        .where('organizationId', organizationId)
        .count('* as total')
        .first()
      assert.equal(Number(count?.total ?? 0), 1)

      const message = await db.from('messages').where('id', first.messageId).first()
      assert.equal(message.clientIdempotencyKey, key)
      assert.isNull(message.providerMessageId)
      assert.equal(message.status, 'queued')
    })

    try {
      await service.queueText({
        organizationId,
        conversationId: seeded.conversationId,
        text: 'Different body',
        actorUserId: agentId,
        idempotencyKey: key,
      })
      assert.fail('expected idempotency conflict')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_IDEMPOTENCY_KEY_CONFLICT')
    }
  })

  test('emits InboxMessageQueued / Sent / Failed around durable state', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const service = new WhatsappOutboundService(fakeGraph())

    const queuedEvents: unknown[] = []
    const sentEvents: unknown[] = []
    const failedEvents: unknown[] = []
    const { default: InboxMessageQueued } = await import('#events/inbox_message_queued')
    const { default: InboxMessageSent } = await import('#events/inbox_message_sent')
    const { default: InboxMessageFailed } = await import('#events/inbox_message_failed')

    const originalQueued = InboxMessageQueued.dispatch.bind(InboxMessageQueued)
    const originalSent = InboxMessageSent.dispatch.bind(InboxMessageSent)
    const originalFailed = InboxMessageFailed.dispatch.bind(InboxMessageFailed)
    InboxMessageQueued.dispatch = (async (payload: unknown) => {
      queuedEvents.push(payload)
    }) as typeof InboxMessageQueued.dispatch
    InboxMessageSent.dispatch = (async (payload: unknown) => {
      sentEvents.push(payload)
    }) as typeof InboxMessageSent.dispatch
    InboxMessageFailed.dispatch = (async (payload: unknown) => {
      failedEvents.push(payload)
    }) as typeof InboxMessageFailed.dispatch

    try {
      const queued = await service.queueText({
        organizationId,
        conversationId: seeded.conversationId,
        text: 'evented',
      })
      assert.lengthOf(queuedEvents, 1)
      assert.equal((queuedEvents[0] as { messageId: string }).messageId, queued.messageId)
      assert.isNull((queuedEvents[0] as { providerMessageId: null }).providerMessageId)

      const sent = await service.executeDispatch({
        organizationId,
        dispatchId: queued.dispatchId,
        lockOwner: 'test-events-sent',
      })
      assert.equal(sent.outcome, 'sent')
      assert.lengthOf(sentEvents, 1)
      assert.equal(
        (sentEvents[0] as { providerMessageId: string }).providerMessageId,
        'wamid.out.text'
      )

      const failOrg = await createOrg()
      orgIds.push(failOrg)
      const failSeeded = await seedConversation(failOrg)
      const failing = new WhatsappOutboundService(
        fakeGraph({
          sendTextMessage: async () => {
            throw new MetaGraphApiError('bad request', 400, null, 'sendText')
          },
        })
      )
      const failQueued = await failing.queueText({
        organizationId: failOrg,
        conversationId: failSeeded.conversationId,
        text: 'will fail',
      })
      const failed = await failing.executeDispatch({
        organizationId: failOrg,
        dispatchId: failQueued.dispatchId,
        lockOwner: 'test-events-fail',
      })
      assert.equal(failed.outcome, 'failed')
      assert.lengthOf(failedEvents, 1)
    } finally {
      InboxMessageQueued.dispatch = originalQueued
      InboxMessageSent.dispatch = originalSent
      InboxMessageFailed.dispatch = originalFailed
    }
  })

  test('recovery job re-enqueues pending, due retry, and expired lease wakes', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const seeded = await seedConversation(organizationId)
    const service = new WhatsappOutboundService(fakeGraph())
    const queue = await nullQueueDriver()
    queue.clearEnqueued()

    const pending = await service.queueText({
      organizationId,
      conversationId: seeded.conversationId,
      text: 'pending wake lost',
    })
    queue.clearEnqueued()

    const retry = await service.queueText({
      organizationId,
      conversationId: seeded.conversationId,
      text: 'retry due',
    })
    const expired = await service.queueText({
      organizationId,
      conversationId: seeded.conversationId,
      text: 'expired lease',
    })

    await runWithTenant(organizationId, async () => {
      await db
        .from('outbound_dispatches')
        .where('id', retry.dispatchId)
        .update({
          status: 'retry_scheduled',
          nextAttemptAt: new Date(Date.now() - 60_000),
          updatedAt: new Date(),
        })
      await db
        .from('outbound_dispatches')
        .where('id', expired.dispatchId)
        .update({
          status: 'processing',
          lockOwner: 'dead-worker',
          lockedAt: new Date(Date.now() - 10 * 60_000),
          lockExpiresAt: new Date(Date.now() - 60_000),
          updatedAt: new Date(),
        })
    })

    queue.clearEnqueued()
    const { createWhatsappOutboundRecoveryHandler } =
      await import('#services/job_queue/handlers/whatsapp_outbound_recovery_handler')
    const handler = createWhatsappOutboundRecoveryHandler(service)
    await handler({
      id: 'recovery-1',
      name: JOB_NAMES.WHATSAPP_OUTBOUND_RECOVERY,
      data: { organizationId, limit: 50 },
    })

    const wakes = queue.enqueued.filter((job) => job.name === JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH)
    const wokenIds = new Set(wakes.map((job) => job.data.dispatchId))
    assert.isTrue(wokenIds.has(pending.dispatchId))
    assert.isTrue(wokenIds.has(retry.dispatchId))
    assert.isTrue(wokenIds.has(expired.dispatchId))
    for (const wake of wakes) {
      assert.equal(wake.options?.singletonKey, wake.data.dispatchId)
    }
  })
})
