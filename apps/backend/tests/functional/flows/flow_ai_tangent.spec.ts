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
import { ContactConsentRepository } from '#repositories/contact_consent_repository'
import { ConversationAiRepository } from '#repositories/conversation_ai_repository'
import { AiUsageLogRepository } from '#repositories/ai_usage_log_repository'
import { FlowExecutionLogRepository } from '#repositories/flow_execution_log_repository'
import { FlowRepository } from '#repositories/flow_repository'
import { FlowSessionRepository } from '#repositories/flow_session_repository'
import AiAnswerCacheService from '#services/ai/ai_answer_cache_service'
import AiConversationSummaryService from '#services/ai/ai_conversation_summary_service'
import FakeLlmProvider from '#services/ai/drivers/fake_llm_provider'
import type KnowledgeRetrievalService from '#services/ai/knowledge_retrieval_service'
import type PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import FlowAiOrchestrator from '#services/flow/flow_ai_orchestrator'
import FlowExecutionEngine from '#services/flow/flow_execution_engine'
import FlowOutboundAdapter from '#services/flow/flow_outbound_adapter'
import { createFlowsAdvanceSessionHandler } from '#services/job_queue/handlers/flows_advance_session_handler'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'
import type NullJobQueueDriver from '#services/job_queue/drivers/null_driver'
import { runWithTenant } from '#services/tenant_context'

type RetrievalMode = 'high' | 'low'

async function createOrg() {
  const id = randomUUID()
  const slug = `flow-ai-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Flow AI ${slug}`,
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
        phoneNumberId: `pn-ai-${randomUUID().slice(0, 8)}`,
        wabaId: 'waba-ai',
        accessToken: encryptWhatsappAccessToken('plain-token-ai'),
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
        name: 'AI Contact',
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
        aiMode: ConversationAiMode.AI_AUTO,
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

function waitingMenuGraph() {
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
          bodyText: 'Pick a department',
          buttons: [{ id: 'btn_ok', title: 'OK' }],
        },
      },
      {
        id: 'exit',
        type: 'EXIT',
        position: { x: 0, y: 160 },
        data: { label: 'Exit' },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'menu' },
      { id: 'e2', source: 'menu', sourceHandle: 'btn_ok', target: 'exit' },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

function waitingInputGraph() {
  return {
    nodes: [
      {
        id: 'trigger',
        type: 'TRIGGER',
        position: { x: 0, y: 0 },
        data: { label: 'Start' },
      },
      {
        id: 'ask',
        type: 'MESSAGE',
        position: { x: 0, y: 80 },
        data: {
          label: 'Ask',
          messageType: 'text',
          text: 'What is your order id?',
          waitForResponse: true,
          inputVariableKey: 'order_id',
        },
      },
      {
        id: 'done',
        type: 'MESSAGE',
        position: { x: 0, y: 160 },
        data: { label: 'Done', messageType: 'text', text: 'Got it' },
      },
      {
        id: 'exit',
        type: 'EXIT',
        position: { x: 0, y: 240 },
        data: { label: 'Exit' },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'ask' },
      { id: 'e2', source: 'ask', target: 'done' },
      { id: 'e3', source: 'done', target: 'exit' },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

function handoverGraph() {
  return {
    nodes: [
      {
        id: 'trigger',
        type: 'TRIGGER',
        position: { x: 0, y: 0 },
        data: { label: 'Start' },
      },
      {
        id: 'handover',
        type: 'HUMAN_HANDOVER',
        position: { x: 0, y: 80 },
        data: {
          label: 'Hand off',
          reason: 'flow_handover_node',
          handoverMessage: 'Connecting you to an agent.',
        },
      },
    ],
    edges: [{ id: 'e1', source: 'trigger', target: 'handover' }],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

async function seedPublishedFlow(
  organizationId: string,
  graph: ReturnType<typeof waitingMenuGraph>,
  settings?: { tangentResume?: string; handoverKeywords?: string[] }
) {
  return runWithTenant(organizationId, async () => {
    const [flow] = await db
      .table('flows')
      .insert({
        organizationId,
        name: `AI Flow ${randomUUID().slice(0, 8)}`,
        status: FlowStatus.DRAFT,
        triggerType: 'KEYWORD',
        triggerConfig: { keywords: ['hi'], matchType: 'exact' },
        settings: {
          sessionTtlMinutes: 60,
          onExpiry: 'RESUME_PROMPT',
          tangentResume: settings?.tangentResume ?? 'IMMEDIATE_REPROMPT',
          handoverKeywords: settings?.handoverKeywords ?? ['human', 'agent'],
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
    await db.from('contact_consent_events').where('organizationId', organizationId).delete()
    await db.from('contacts').where('organizationId', organizationId).delete()
    await db.from('whatsapp_configs').where('organizationId', organizationId).delete()
  })
  await db.from('organizations').where('id', organizationId).delete()
}

async function dispatchInbound(params: {
  organizationId: string
  conversationId: string
  contactId: string
  contentText: string | null
  interactiveReplyId?: string | null
}) {
  await InboxMessageReceived.dispatch({
    organizationId: params.organizationId,
    conversationId: params.conversationId,
    messageId: randomUUID(),
    whatsappConfigId: randomUUID(),
    contactId: params.contactId,
    contentType: params.interactiveReplyId ? 'interactive' : 'text',
    contentText: params.contentText,
    interactiveReplyId: params.interactiveReplyId ?? null,
    direction: 'inbound',
    providerMessageId: `wamid.${randomUUID()}`,
    status: 'delivered',
    occurredAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  })
}

async function drainFlowAdvanceJobs(queue: NullJobQueueDriver) {
  const handler = queue.handlers.get(JOB_NAMES.FLOWS_ADVANCE_SESSION)
  if (!handler) throw new Error('FLOWS_ADVANCE_SESSION handler missing')
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

test.group('Flows | AI tangent + handover', (group) => {
  const orgIds: string[] = []
  let queue: NullJobQueueDriver
  let retrievalMode: RetrievalMode = 'high'
  let llm: FakeLlmProvider

  group.setup(async () => {
    const manager = await app.container.make(JobQueueManager)
    queue = (await manager.ensureStarted()) as NullJobQueueDriver
    llm = new FakeLlmProvider()
    llm.text = 'Store hours are 9am–5pm.'

    const retrieval = {
      async retrieve() {
        if (retrievalMode === 'low') {
          return {
            chunks: [],
            maxScore: 0.1,
            minConfidenceScore: 0.7,
            meetsMinConfidence: false,
            campaign: null,
          }
        }
        return {
          chunks: [
            {
              id: 'c1',
              documentId: 'd1',
              content: 'We are open 9am to 5pm.',
              score: 0.95,
            },
          ],
          maxScore: 0.95,
          minConfidenceScore: 0.7,
          meetsMinConfidence: true,
          campaign: null,
        }
      },
    } as unknown as KnowledgeRetrievalService

    const platform = {
      async get() {
        return {
          isEnabled: true,
          minConfidenceScore: 0.7,
          systemPrompt: 'Answer from context.',
          chatModel: 'fake',
          temperature: 0.2,
          maxOutputTokens: 256,
          activeEmbeddingSpaceId: 'test:space:v1',
        }
      },
    } as unknown as PlatformAiConfigService

    const orchestrator = new FlowAiOrchestrator(
      retrieval,
      platform,
      new ConversationAiRepository(),
      new FlowOutboundAdapter(),
      new AiUsageLogRepository(),
      new AiAnswerCacheService(),
      new AiConversationSummaryService(),
      llm
    )
    const engine = new FlowExecutionEngine(
      new FlowSessionRepository(),
      new FlowRepository(),
      new FlowExecutionLogRepository(),
      new FlowOutboundAdapter(),
      new ContactConsentRepository(),
      orchestrator
    )
    await queue.work(JOB_NAMES.FLOWS_ADVANCE_SESSION, createFlowsAdvanceSessionHandler(engine))
  })

  group.each.setup(() => {
    queue.clearEnqueued()
    queue.clearRemoved()
    retrievalMode = 'high'
    llm.text = 'Store hours are 9am–5pm.'
    llm.calls.length = 0
  })

  group.each.teardown(async () => {
    while (orgIds.length > 0) {
      const id = orgIds.pop()
      if (id) await cleanupOrg(id)
    }
  })

  async function startWaitingMenu(organizationId: string, tangentResume?: string) {
    const fixture = await seedConversation(organizationId)
    await seedPublishedFlow(organizationId, waitingMenuGraph(), { tangentResume })
    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'hi',
    })
    await drainFlowAdvanceJobs(queue)
    const session = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('conversationId', fixture.conversationId).first()
    )
    return { fixture, session }
  }

  test('off-topic text on menu re-prompts under IMMEDIATE_REPROMPT', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const { fixture, session } = await startWaitingMenu(organizationId, 'IMMEDIATE_REPROMPT')
    assert.equal(session!.status, FlowSessionStatus.WAITING_FOR_INPUT)
    assert.equal(session!.currentNodeId, 'menu')

    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'What are your store hours?',
    })
    await drainFlowAdvanceJobs(queue)

    const after = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(after!.status, FlowSessionStatus.WAITING_FOR_INPUT)
    assert.equal(after!.currentNodeId, 'menu')

    const aiMsg = await runWithTenant(organizationId, () =>
      db
        .from('messages')
        .where('organizationId', organizationId)
        .where('conversationId', fixture.conversationId)
        .where('senderType', 'ai')
        .orderBy('createdAt', 'desc')
        .first()
    )
    assert.isNotNull(aiMsg)
    assert.include(String(aiMsg!.contentText), 'Store hours are 9am–5pm.')
    assert.include(String(aiMsg!.contentText), 'Pick a department')
    assert.isAbove(llm.calls.length, 0)

    const conversation = await runWithTenant(organizationId, () =>
      db.from('conversations').where('id', fixture.conversationId).first()
    )
    assert.equal(conversation!.aiMode, ConversationAiMode.AI_AUTO)
  })

  test('off-topic text on menu holds without re-prompt under WAIT_FOR_NEXT', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const { fixture, session } = await startWaitingMenu(organizationId, 'WAIT_FOR_NEXT')

    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'What are your store hours?',
    })
    await drainFlowAdvanceJobs(queue)

    const after = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(after!.status, FlowSessionStatus.WAITING_FOR_INPUT)
    assert.equal(after!.currentNodeId, 'menu')

    const aiMsg = await runWithTenant(organizationId, () =>
      db
        .from('messages')
        .where('organizationId', organizationId)
        .where('conversationId', fixture.conversationId)
        .where('senderType', 'ai')
        .orderBy('createdAt', 'desc')
        .first()
    )
    assert.isNotNull(aiMsg)
    assert.equal(String(aiMsg!.contentText), 'Store hours are 9am–5pm.')
    assert.notInclude(String(aiMsg!.contentText), 'Pick a department')
  })

  test('per-flow handover keyword pauses the waiting session', async ({ assert }) => {
    retrievalMode = 'high'
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const { fixture, session } = await startWaitingMenu(organizationId, undefined)

    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'I need an agent please',
    })
    await drainFlowAdvanceJobs(queue)

    const after = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(after!.status, FlowSessionStatus.PAUSED_FOR_HUMAN)

    const conversation = await runWithTenant(organizationId, () =>
      db.from('conversations').where('id', fixture.conversationId).first()
    )
    assert.equal(conversation!.aiMode, ConversationAiMode.HANDOVER)
    assert.equal(conversation!.aiHandoverReason, 'agent')
  })

  test('low-confidence unmatched interactive input pauses for human handover', async ({
    assert,
  }) => {
    retrievalMode = 'low'
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const { fixture, session } = await startWaitingMenu(organizationId)

    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'something unrelated and unknown',
    })
    await drainFlowAdvanceJobs(queue)

    const after = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(after!.status, FlowSessionStatus.PAUSED_FOR_HUMAN)

    const conversation = await runWithTenant(organizationId, () =>
      db.from('conversations').where('id', fixture.conversationId).first()
    )
    assert.equal(conversation!.aiMode, ConversationAiMode.HANDOVER)
    assert.equal(conversation!.aiHandoverReason, 'low_confidence')
  })

  test('MESSAGE wait treats high-confidence RAG as tangent without storing the slot', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const fixture = await seedConversation(organizationId)
    await seedPublishedFlow(organizationId, waitingInputGraph())
    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'hi',
    })
    await drainFlowAdvanceJobs(queue)

    const session = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('conversationId', fixture.conversationId).first()
    )
    assert.equal(session!.currentNodeId, 'ask')

    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'What is your return policy?',
    })
    await drainFlowAdvanceJobs(queue)

    const after = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(after!.status, FlowSessionStatus.WAITING_FOR_INPUT)
    assert.equal(after!.currentNodeId, 'ask')
    const variables =
      typeof after!.variables === 'string' ? JSON.parse(after!.variables) : after!.variables
    assert.notProperty(variables ?? {}, 'order_id')
  })

  test('HUMAN_HANDOVER node pauses session and stamps conversation', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const fixture = await seedConversation(organizationId)
    await seedPublishedFlow(organizationId, handoverGraph())

    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'hi',
    })
    await drainFlowAdvanceJobs(queue)

    const session = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('conversationId', fixture.conversationId).first()
    )
    assert.equal(session!.status, FlowSessionStatus.PAUSED_FOR_HUMAN)
    assert.equal(session!.currentNodeId, 'handover')

    const farewell = await runWithTenant(organizationId, () =>
      db
        .from('messages')
        .where('organizationId', organizationId)
        .where('contentText', 'Connecting you to an agent.')
        .first()
    )
    assert.isNotNull(farewell)

    const conversation = await runWithTenant(organizationId, () =>
      db.from('conversations').where('id', fixture.conversationId).first()
    )
    assert.equal(conversation!.aiMode, ConversationAiMode.HANDOVER)
    assert.equal(conversation!.aiHandoverReason, 'flow_handover_node')
  })
})
