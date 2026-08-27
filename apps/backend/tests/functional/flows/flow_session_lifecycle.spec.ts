import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { ConversationAiMode } from '#enums/conversation_ai_mode'
import { FlowSessionStatus } from '#enums/flow_session_status'
import { FlowStatus } from '#enums/flow_status'
import { FlowValidationStatus } from '#enums/flow_validation_status'
import InboxMessageReceived from '#events/inbox_message_received'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import ConversationAiModeService from '#services/ai/conversation_ai_mode_service'
import FlowSessionLifecycleService, {
  FLOW_SESSION_EXPIRED_PROMPT_PREFIX,
} from '#services/flow/flow_session_lifecycle_service'
import { createFlowsAdvanceSessionHandler } from '#services/job_queue/handlers/flows_advance_session_handler'
import { createFlowsSessionRecoveryHandler } from '#services/job_queue/handlers/flows_session_recovery_handler'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'
import type NullJobQueueDriver from '#services/job_queue/drivers/null_driver'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `flow-life-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Flow Life ${slug}`,
      slug,
      email: `${slug}@example.com`,
      country: 'US',
      timezone: 'UTC',
      currency: 'USD',
      status: 'active',
    })
    .returning(['id'])
  return row.id as string
}

async function seedConversation(organizationId: string) {
  return runWithTenant(organizationId, async () => {
    const [config] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId,
        phoneNumberId: `pn-life-${randomUUID().slice(0, 8)}`,
        wabaId: 'waba-life',
        accessToken: encryptWhatsappAccessToken('plain-token-life'),
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id'])

    const phone = `1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
    const [contact] = await db
      .table('contacts')
      .insert({
        organizationId,
        phone,
        phoneNormalized: phone,
        name: 'Life Contact',
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
        aiMode: 'AI_AUTO',
      })
      .returning(['id'])

    const now = new Date()
    await db.table('messages').insert({
      organizationId,
      conversationId: conversation.id,
      senderType: 'contact',
      senderId: null,
      contentType: 'text',
      contentText: 'hi',
      status: 'delivered',
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
      metadata: {},
    })

    return {
      conversationId: conversation.id as string,
      contactId: contact.id as string,
    }
  })
}

function menuGraph() {
  return {
    nodes: [
      {
        id: 'trigger',
        type: 'TRIGGER',
        position: { x: 0, y: 0 },
        data: { label: 'Start' },
      },
      {
        id: 'menu',
        type: 'INTERACTIVE_BUTTON',
        position: { x: 0, y: 80 },
        data: {
          label: 'Menu',
          bodyText: 'Pick one',
          buttons: [
            { id: 'btn_ok', title: 'OK', actionType: 'DEFAULT' },
            { id: 'btn_stop', title: 'Stop', actionType: 'STOP' },
          ],
        },
      },
      {
        id: 'done',
        type: 'EXIT',
        position: { x: 0, y: 160 },
        data: { label: 'Done' },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'menu' },
      { id: 'e2', source: 'menu', target: 'done', sourceHandle: 'btn_ok' },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

async function seedPublishedFlow(
  organizationId: string,
  onExpiry: 'RESUME_PROMPT' | 'RESTART' | 'RESUME_SILENT'
) {
  return runWithTenant(organizationId, async () => {
    const graph = menuGraph()
    const [flow] = await db
      .table('flows')
      .insert({
        organizationId,
        name: `Life ${randomUUID().slice(0, 8)}`,
        status: FlowStatus.DRAFT,
        triggerType: 'KEYWORD',
        triggerConfig: { keywords: ['hi'], matchType: 'exact' },
        settings: {
          sessionTtlMinutes: 60,
          onExpiry,
          tangentResume: 'IMMEDIATE_REPROMPT',
        },
      })
      .returning(['id'])

    const [version] = await db
      .table('flow_versions')
      .insert({
        organizationId,
        flowId: flow.id,
        versionNumber: 1,
        nodes: JSON.stringify(graph.nodes),
        edges: JSON.stringify(graph.edges),
        viewport: JSON.stringify(graph.viewport),
        validationStatus: FlowValidationStatus.VALID,
        validationErrors: JSON.stringify([]),
      })
      .returning(['id'])

    await db.from('flows').where('id', flow.id).update({
      status: FlowStatus.PUBLISHED,
      publishedVersionId: version.id,
      updatedAt: new Date(),
    })

    return { flowId: flow.id as string, versionId: version.id as string }
  })
}

async function dispatchInbound(params: {
  organizationId: string
  conversationId: string
  contactId: string
  contentText: string
}) {
  await InboxMessageReceived.dispatch({
    organizationId: params.organizationId,
    conversationId: params.conversationId,
    messageId: randomUUID(),
    whatsappConfigId: randomUUID(),
    contactId: params.contactId,
    contentType: 'text',
    contentText: params.contentText,
    interactiveReplyId: null,
    direction: 'inbound',
    providerMessageId: `wamid.${randomUUID()}`,
    status: 'delivered',
    occurredAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  })
}

async function drainFlowAdvanceJobs(queue: NullJobQueueDriver) {
  const handler =
    queue.handlers.get(JOB_NAMES.FLOWS_ADVANCE_SESSION) ?? createFlowsAdvanceSessionHandler()
  const jobs = queue.enqueued.filter((job) => job.name === JOB_NAMES.FLOWS_ADVANCE_SESSION)
  queue.clearEnqueued()
  for (const job of jobs) {
    await handler({
      id: `test-${randomUUID()}`,
      name: JOB_NAMES.FLOWS_ADVANCE_SESSION,
      data: job.data,
    })
  }
}

async function startWaitingSession(params: {
  organizationId: string
  queue: NullJobQueueDriver
  onExpiry: 'RESUME_PROMPT' | 'RESTART' | 'RESUME_SILENT'
}) {
  const fixture = await seedConversation(params.organizationId)
  await seedPublishedFlow(params.organizationId, params.onExpiry)
  await dispatchInbound({
    organizationId: params.organizationId,
    conversationId: fixture.conversationId,
    contactId: fixture.contactId,
    contentText: 'hi',
  })
  await drainFlowAdvanceJobs(params.queue)
  const session = await runWithTenant(params.organizationId, () =>
    db
      .from('flow_sessions')
      .where('organizationId', params.organizationId)
      .where('conversationId', fixture.conversationId)
      .first()
  )
  return { fixture, session }
}

async function expireSession(organizationId: string, sessionId: string) {
  await runWithTenant(organizationId, () =>
    db
      .from('flow_sessions')
      .where('id', sessionId)
      .update({ expiresAt: new Date(Date.now() - 60_000), updatedAt: new Date() })
  )
}

async function cleanupOrg(organizationId: string) {
  await runWithTenant(organizationId, async () => {
    await db.from('flow_execution_logs').where('organizationId', organizationId).delete()
    await db.from('flow_sessions').where('organizationId', organizationId).delete()
    await db
      .from('flows')
      .where('organizationId', organizationId)
      .update({ publishedVersionId: null })
    await db.from('flow_versions').where('organizationId', organizationId).delete()
    await db.from('flows').where('organizationId', organizationId).delete()
    await db.from('outbound_dispatches').where('organizationId', organizationId).delete()
    await db.from('messages').where('organizationId', organizationId).delete()
    await db.from('conversations').where('organizationId', organizationId).delete()
    await db.from('contacts').where('organizationId', organizationId).delete()
    await db.from('whatsapp_configs').where('organizationId', organizationId).delete()
  })
  await db.from('organizations').where('id', organizationId).delete()
}

test.group('Flows | session lifecycle', (group) => {
  const orgIds: string[] = []
  let queue: NullJobQueueDriver

  group.setup(async () => {
    const manager = await app.container.make(JobQueueManager)
    queue = (await manager.ensureStarted()) as NullJobQueueDriver
    await queue.work(JOB_NAMES.FLOWS_ADVANCE_SESSION, createFlowsAdvanceSessionHandler())
  })

  group.each.setup(() => {
    queue.clearEnqueued()
    queue.clearRemoved()
  })

  group.each.teardown(async () => {
    while (orgIds.length > 0) {
      const id = orgIds.pop()
      if (id) await cleanupOrg(id)
    }
  })

  test('RESUME_PROMPT sends a timeout hint and keeps the pending node', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const { session } = await startWaitingSession({
      organizationId,
      queue,
      onExpiry: 'RESUME_PROMPT',
    })
    assert.equal(session?.status, FlowSessionStatus.WAITING_FOR_INPUT)
    const nodeId = session!.currentNodeId as string
    await expireSession(organizationId, session!.id as string)

    const lifecycle = new FlowSessionLifecycleService()
    const result = await lifecycle.recoverExpiredSessions({ organizationId, limit: 10 })
    assert.equal(result.recovered, 1)

    const updated = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(updated?.status, FlowSessionStatus.WAITING_FOR_INPUT)
    assert.equal(updated?.currentNodeId, nodeId)
    assert.isTrue(new Date(updated!.expiresAt as string).getTime() > Date.now())

    const prompt = await runWithTenant(organizationId, () =>
      db
        .from('messages')
        .where('organizationId', organizationId)
        .where('senderType', 'system')
        .whereILike('contentText', `%${FLOW_SESSION_EXPIRED_PROMPT_PREFIX.trim()}%`)
        .first()
    )
    assert.isNotNull(prompt)
    assert.include(String(prompt!.contentText), 'Pick one')
  })

  test('RESUME_SILENT refreshes TTL without sending a timeout message', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const { session } = await startWaitingSession({
      organizationId,
      queue,
      onExpiry: 'RESUME_SILENT',
    })
    const outboundBefore = await runWithTenant(organizationId, () =>
      db.from('messages').where('organizationId', organizationId).where('senderType', 'system')
    )
    await expireSession(organizationId, session!.id as string)

    await new FlowSessionLifecycleService().recoverExpiredSessions({ organizationId, limit: 10 })

    const updated = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(updated?.status, FlowSessionStatus.WAITING_FOR_INPUT)
    assert.equal(updated?.currentNodeId, session!.currentNodeId)
    assert.isTrue(new Date(updated!.expiresAt as string).getTime() > Date.now())

    const outboundAfter = await runWithTenant(organizationId, () =>
      db.from('messages').where('organizationId', organizationId).where('senderType', 'system')
    )
    assert.equal(outboundAfter.length, outboundBefore.length)
  })

  test('RESTART terminates the expired session so the next keyword starts fresh', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const { fixture, session } = await startWaitingSession({
      organizationId,
      queue,
      onExpiry: 'RESTART',
    })
    await expireSession(organizationId, session!.id as string)

    await new FlowSessionLifecycleService().recoverExpiredSessions({ organizationId, limit: 10 })

    const expired = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(expired?.status, FlowSessionStatus.TERMINATED)

    queue.clearEnqueued()
    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'hi',
    })
    await drainFlowAdvanceJobs(queue)

    const sessions = await runWithTenant(organizationId, () =>
      db
        .from('flow_sessions')
        .where('organizationId', organizationId)
        .where('conversationId', fixture.conversationId)
        .orderBy('createdAt', 'asc')
    )
    assert.equal(sessions.length, 2)
    assert.equal(sessions[1].status, FlowSessionStatus.WAITING_FOR_INPUT)
    assert.notEqual(sessions[1].id, session!.id)
  })

  test('agent takeover pauses the session and later inbound does not advance the flow', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const { fixture, session } = await startWaitingSession({
      organizationId,
      queue,
      onExpiry: 'RESUME_PROMPT',
    })

    await new ConversationAiModeService().takeover({
      organizationId,
      conversationId: fixture.conversationId,
    })

    const paused = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(paused?.status, FlowSessionStatus.PAUSED_FOR_HUMAN)

    const conversation = await runWithTenant(organizationId, () =>
      db.from('conversations').where('id', fixture.conversationId).first()
    )
    assert.equal(conversation?.aiMode, ConversationAiMode.HUMAN_ACTIVE)

    const outboundBefore = await runWithTenant(organizationId, () =>
      db.from('messages').where('organizationId', organizationId).whereNot('senderType', 'contact')
    )

    queue.clearEnqueued()
    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'hi',
    })
    await drainFlowAdvanceJobs(queue)

    assert.isFalse(queue.enqueued.some((job) => job.name === JOB_NAMES.FLOWS_ADVANCE_SESSION))

    const outboundAfter = await runWithTenant(organizationId, () =>
      db.from('messages').where('organizationId', organizationId).whereNot('senderType', 'contact')
    )
    assert.equal(outboundAfter.length, outboundBefore.length)
    const stillPaused = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(stillPaused?.status, FlowSessionStatus.PAUSED_FOR_HUMAN)
  })

  test('resume AI terminates a paused session so the next keyword starts a fresh flow', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const { fixture, session } = await startWaitingSession({
      organizationId,
      queue,
      onExpiry: 'RESUME_PROMPT',
    })

    await new ConversationAiModeService().takeover({
      organizationId,
      conversationId: fixture.conversationId,
    })
    await new ConversationAiModeService().resume({
      organizationId,
      conversationId: fixture.conversationId,
    })

    const terminated = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(terminated?.status, FlowSessionStatus.TERMINATED)

    const conversation = await runWithTenant(organizationId, () =>
      db.from('conversations').where('id', fixture.conversationId).first()
    )
    assert.equal(conversation?.aiMode, ConversationAiMode.AI_AUTO)

    queue.clearEnqueued()
    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'hi',
    })
    await drainFlowAdvanceJobs(queue)

    const sessions = await runWithTenant(organizationId, () =>
      db
        .from('flow_sessions')
        .where('organizationId', organizationId)
        .where('conversationId', fixture.conversationId)
        .orderBy('createdAt', 'asc')
    )
    assert.equal(sessions.length, 2)
    assert.equal(sessions[0].id, session!.id)
    assert.equal(sessions[0].status, FlowSessionStatus.TERMINATED)
    assert.equal(sessions[1].status, FlowSessionStatus.WAITING_FOR_INPUT)
    assert.notEqual(sessions[1].id, session!.id)
  })

  test('HUMAN_ACTIVE with no open session blocks keyword start', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const fixture = await seedConversation(organizationId)
    await seedPublishedFlow(organizationId, 'RESUME_PROMPT')

    await runWithTenant(organizationId, () =>
      db.from('conversations').where('id', fixture.conversationId).update({
        aiMode: ConversationAiMode.HUMAN_ACTIVE,
        aiHandoverReason: 'takeover',
      })
    )

    queue.clearEnqueued()
    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'hi',
    })
    await drainFlowAdvanceJobs(queue)

    assert.isFalse(queue.enqueued.some((job) => job.name === JOB_NAMES.FLOWS_ADVANCE_SESSION))
    const sessions = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('conversationId', fixture.conversationId)
    )
    assert.equal(sessions.length, 0)
  })

  test('HANDOVER with no pause row blocks keyword start', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const fixture = await seedConversation(organizationId)
    await seedPublishedFlow(organizationId, 'RESUME_PROMPT')

    await runWithTenant(organizationId, () =>
      db.from('conversations').where('id', fixture.conversationId).update({
        aiMode: ConversationAiMode.HANDOVER,
        aiHandoverReason: 'low_confidence',
      })
    )

    queue.clearEnqueued()
    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'hi',
    })
    await drainFlowAdvanceJobs(queue)

    assert.isFalse(queue.enqueued.some((job) => job.name === JOB_NAMES.FLOWS_ADVANCE_SESSION))
  })

  test('COMPLETED session then keyword starts a fresh flow while AI_AUTO', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const { fixture, session } = await startWaitingSession({
      organizationId,
      queue,
      onExpiry: 'RESUME_PROMPT',
    })

    await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).update({
        status: FlowSessionStatus.COMPLETED,
        updatedAt: new Date(),
      })
    )

    queue.clearEnqueued()
    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'hi',
    })
    await drainFlowAdvanceJobs(queue)

    const sessions = await runWithTenant(organizationId, () =>
      db
        .from('flow_sessions')
        .where('conversationId', fixture.conversationId)
        .orderBy('createdAt', 'asc')
    )
    assert.equal(sessions.length, 2)
    assert.equal(sessions[0].status, FlowSessionStatus.COMPLETED)
    assert.equal(sessions[1].status, FlowSessionStatus.WAITING_FOR_INPUT)
  })

  test('orphan PAUSED_FOR_HUMAN with AI_AUTO blocks until resume terminates it', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const { fixture, session } = await startWaitingSession({
      organizationId,
      queue,
      onExpiry: 'RESUME_PROMPT',
    })

    await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).update({
        status: FlowSessionStatus.PAUSED_FOR_HUMAN,
        updatedAt: new Date(),
      })
    )

    queue.clearEnqueued()
    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'hi',
    })
    await drainFlowAdvanceJobs(queue)
    assert.isFalse(queue.enqueued.some((job) => job.name === JOB_NAMES.FLOWS_ADVANCE_SESSION))

    await new ConversationAiModeService().resume({
      organizationId,
      conversationId: fixture.conversationId,
    })

    const terminated = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(terminated?.status, FlowSessionStatus.TERMINATED)

    queue.clearEnqueued()
    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'hi',
    })
    await drainFlowAdvanceJobs(queue)

    const sessions = await runWithTenant(organizationId, () =>
      db
        .from('flow_sessions')
        .where('conversationId', fixture.conversationId)
        .orderBy('createdAt', 'asc')
    )
    assert.equal(sessions.length, 2)
    assert.equal(sessions[1].status, FlowSessionStatus.WAITING_FOR_INPUT)
  })

  test('recovery job purges execution logs older than the retention window', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const { fixture, session } = await startWaitingSession({
      organizationId,
      queue,
      onExpiry: 'RESUME_SILENT',
    })

    const oldCreatedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
    await runWithTenant(organizationId, async () => {
      await db.table('flow_execution_logs').insert({
        organizationId,
        flowSessionId: session!.id,
        conversationId: fixture.conversationId,
        nodeId: 'stale',
        nodeType: 'SESSION',
        actionTaken: 'OLD',
        createdAt: oldCreatedAt,
      })
    })

    const handler = createFlowsSessionRecoveryHandler()
    await handler({
      id: 'recovery-logs',
      name: JOB_NAMES.FLOWS_SESSION_RECOVERY,
      data: { organizationId, limit: 50 },
    })

    const stale = await runWithTenant(organizationId, () =>
      db
        .from('flow_execution_logs')
        .where('organizationId', organizationId)
        .where('nodeId', 'stale')
        .first()
    )
    assert.isNull(stale)
  })
})
