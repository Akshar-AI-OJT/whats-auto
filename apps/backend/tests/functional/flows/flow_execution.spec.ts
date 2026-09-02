import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { FlowSessionStatus } from '#enums/flow_session_status'
import { FlowStatus } from '#enums/flow_status'
import { FlowValidationStatus } from '#enums/flow_validation_status'
import InboxMessageReceived from '#events/inbox_message_received'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import { FLOW_STOP_FAREWELL } from '#services/flow/flow_execution_engine'
import { createFlowsAdvanceSessionHandler } from '#services/job_queue/handlers/flows_advance_session_handler'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'
import type NullJobQueueDriver from '#services/job_queue/drivers/null_driver'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `flow-exec-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Flow Exec ${slug}`,
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
        phoneNumberId: `pn-exec-${randomUUID().slice(0, 8)}`,
        wabaId: 'waba-exec',
        accessToken: encryptWhatsappAccessToken('plain-token-exec'),
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id'])

    const phone = '15551234999'
    const [contact] = await db
      .table('contacts')
      .insert({
        organizationId,
        phone,
        phoneNormalized: phone,
        name: 'Exec Contact',
        customFields: {},
      })
      .returning(['id', 'name'])

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
    const [inbound] = await db
      .table('messages')
      .insert({
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
      .returning(['id'])

    return {
      conversationId: conversation.id as string,
      contactId: contact.id as string,
      contactName: contact.name as string,
      messageId: inbound.id as string,
    }
  })
}

function validExecutableGraph() {
  return {
    nodes: [
      {
        id: 'trigger',
        type: 'TRIGGER',
        position: { x: 0, y: 0 },
        data: { label: 'Start' },
      },
      {
        id: 'welcome',
        type: 'MESSAGE',
        position: { x: 0, y: 80 },
        data: {
          label: 'Welcome',
          messageType: 'text',
          text: 'Hello {{contact.name}}',
        },
      },
      {
        id: 'menu',
        type: 'INTERACTIVE_BUTTON',
        position: { x: 0, y: 160 },
        data: {
          label: 'Menu',
          bodyText: 'Pick one',
          buttons: [
            { id: 'btn_ok', title: 'OK' },
            { id: 'btn_stop', title: 'Stop', actionType: 'STOP' },
          ],
        },
      },
      {
        id: 'done',
        type: 'MESSAGE',
        position: { x: 0, y: 240 },
        data: {
          label: 'Done',
          messageType: 'text',
          text: 'Thanks!',
        },
      },
      {
        id: 'exit',
        type: 'EXIT',
        position: { x: 0, y: 320 },
        data: { label: 'Exit' },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'welcome' },
      { id: 'e2', source: 'welcome', target: 'menu' },
      { id: 'e3', source: 'menu', sourceHandle: 'btn_ok', target: 'done' },
      { id: 'e4', source: 'done', target: 'exit' },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

function nestedNavGraph() {
  return {
    nodes: [
      {
        id: 'trigger',
        type: 'TRIGGER',
        position: { x: 0, y: 0 },
        data: { label: 'Start' },
      },
      {
        id: 'welcome',
        type: 'MESSAGE',
        position: { x: 0, y: 80 },
        data: {
          label: 'Welcome',
          messageType: 'text',
          text: 'Hello {{contact.name}}',
        },
      },
      {
        id: 'menu',
        type: 'INTERACTIVE_BUTTON',
        position: { x: 0, y: 160 },
        data: {
          label: 'Menu',
          bodyText: 'Main menu',
          buttons: [
            { id: 'btn_products', title: 'Products' },
            { id: 'btn_back', title: 'Back', actionType: 'BACK' },
            { id: 'btn_stop', title: 'Stop', actionType: 'STOP' },
          ],
        },
      },
      {
        id: 'submenu',
        type: 'INTERACTIVE_BUTTON',
        position: { x: 0, y: 240 },
        data: {
          label: 'Products',
          bodyText: 'Product menu',
          buttons: [
            { id: 'btn_item', title: 'Item' },
            { id: 'btn_back', title: 'Back', actionType: 'BACK' },
            { id: 'btn_main', title: 'Main', actionType: 'MAIN_MENU' },
          ],
        },
      },
      {
        id: 'done',
        type: 'MESSAGE',
        position: { x: 0, y: 320 },
        data: {
          label: 'Done',
          messageType: 'text',
          text: 'Thanks!',
        },
      },
      {
        id: 'exit',
        type: 'EXIT',
        position: { x: 0, y: 400 },
        data: { label: 'Exit' },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'welcome' },
      { id: 'e2', source: 'welcome', target: 'menu' },
      { id: 'e3', source: 'menu', sourceHandle: 'btn_products', target: 'submenu' },
      { id: 'e4', source: 'submenu', sourceHandle: 'btn_item', target: 'done' },
      { id: 'e5', source: 'done', target: 'exit' },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

function conditionGraph() {
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
          text: 'Which plan?',
          waitForResponse: true,
          inputVariableKey: 'plan',
        },
      },
      {
        id: 'cond',
        type: 'CONDITION',
        position: { x: 0, y: 160 },
        data: {
          label: 'Plan',
          fallbackHandle: 'other',
          conditions: [{ id: 'vip', variableKey: 'plan', operator: 'equals', value: 'vip' }],
        },
      },
      {
        id: 'vip_msg',
        type: 'MESSAGE',
        position: { x: 0, y: 240 },
        data: { label: 'VIP', messageType: 'text', text: 'VIP path' },
      },
      {
        id: 'other_msg',
        type: 'MESSAGE',
        position: { x: 0, y: 320 },
        data: { label: 'Other', messageType: 'text', text: 'Other path' },
      },
      {
        id: 'exit',
        type: 'EXIT',
        position: { x: 0, y: 400 },
        data: { label: 'Exit' },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'ask' },
      { id: 'e2', source: 'ask', target: 'cond' },
      { id: 'e3', source: 'cond', sourceHandle: 'vip', target: 'vip_msg' },
      { id: 'e4', source: 'cond', sourceHandle: 'other', target: 'other_msg' },
      { id: 'e5', source: 'vip_msg', target: 'exit' },
      { id: 'e6', source: 'other_msg', target: 'exit' },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

function parentSubflowGraph(subflowId: string) {
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
          bodyText: 'Go to subflow',
          buttons: [{ id: 'btn_go', title: 'Go' }],
        },
      },
      {
        id: 'call',
        type: 'SUBFLOW',
        position: { x: 0, y: 160 },
        data: { label: 'Call', subflowId, inputVariablePassThrough: true },
      },
      {
        id: 'after',
        type: 'MESSAGE',
        position: { x: 0, y: 240 },
        data: { label: 'After', messageType: 'text', text: 'Returned' },
      },
      {
        id: 'exit',
        type: 'EXIT',
        position: { x: 0, y: 320 },
        data: { label: 'Exit' },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'menu' },
      { id: 'e2', source: 'menu', sourceHandle: 'btn_go', target: 'call' },
      { id: 'e3', source: 'call', target: 'after' },
      { id: 'e4', source: 'after', target: 'exit' },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

function childSubflowGraph() {
  return {
    nodes: [
      {
        id: 'trigger',
        type: 'TRIGGER',
        position: { x: 0, y: 0 },
        data: { label: 'Start' },
      },
      {
        id: 'submenu',
        type: 'INTERACTIVE_BUTTON',
        position: { x: 0, y: 80 },
        data: {
          label: 'Sub',
          bodyText: 'Subflow menu',
          buttons: [{ id: 'btn_back', title: 'Back', actionType: 'BACK' }],
        },
      },
    ],
    edges: [{ id: 'e1', source: 'trigger', target: 'submenu' }],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

function selfSubflowGraph(subflowId: string) {
  return {
    nodes: [
      {
        id: 'trigger',
        type: 'TRIGGER',
        position: { x: 0, y: 0 },
        data: { label: 'Start' },
      },
      {
        id: 'call',
        type: 'SUBFLOW',
        position: { x: 0, y: 80 },
        data: { label: 'Loop', subflowId, inputVariablePassThrough: true },
      },
    ],
    edges: [{ id: 'e1', source: 'trigger', target: 'call' }],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

async function seedPublishedFlow(
  organizationId: string,
  graph: ReturnType<typeof validExecutableGraph> = validExecutableGraph(),
  opts?: {
    triggerType?: string
    triggerConfig?: Record<string, unknown>
  }
) {
  return runWithTenant(organizationId, async () => {
    const [flow] = await db
      .table('flows')
      .insert({
        organizationId,
        name: `Welcome ${randomUUID().slice(0, 8)}`,
        status: FlowStatus.DRAFT,
        triggerType: opts?.triggerType ?? 'KEYWORD',
        triggerConfig: opts?.triggerConfig ?? { keywords: ['hi'], matchType: 'exact' },
        settings: {
          sessionTtlMinutes: 60,
          onExpiry: 'RESUME_PROMPT',
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

function parseStack(raw: unknown): Array<{ nodeId?: string; menuNodeId?: string }> {
  if (Array.isArray(raw)) return raw as Array<{ nodeId?: string; menuNodeId?: string }>
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed)
        ? (parsed as Array<{ nodeId?: string; menuNodeId?: string }>)
        : []
    } catch {
      return []
    }
  }
  return []
}

async function dispatchInbound(params: {
  organizationId: string
  conversationId: string
  contactId: string
  contentText: string | null
  interactiveReplyId?: string | null
  contentType?: string
}) {
  await InboxMessageReceived.dispatch({
    organizationId: params.organizationId,
    conversationId: params.conversationId,
    messageId: randomUUID(),
    whatsappConfigId: randomUUID(),
    contactId: params.contactId,
    contentType: params.contentType ?? (params.interactiveReplyId ? 'interactive' : 'text'),
    contentText: params.contentText,
    interactiveReplyId: params.interactiveReplyId ?? null,
    direction: 'inbound',
    providerMessageId: `wamid.${randomUUID()}`,
    status: 'delivered',
    occurredAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  })
}

async function startAtMenu(params: {
  organizationId: string
  queue: NullJobQueueDriver
  graph?: ReturnType<typeof validExecutableGraph>
}) {
  const fixture = await seedConversation(params.organizationId)
  await seedPublishedFlow(params.organizationId, params.graph)
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

test.group('Flows | execution engine', (group) => {
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

  test('keyword trigger → welcome → buttons → selection → exit; enqueues flow advance only', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const fixture = await seedConversation(organizationId)
    await seedPublishedFlow(organizationId)

    await InboxMessageReceived.dispatch({
      organizationId,
      conversationId: fixture.conversationId,
      messageId: fixture.messageId,
      whatsappConfigId: randomUUID(),
      contactId: fixture.contactId,
      contentType: 'text',
      contentText: 'hi',
      interactiveReplyId: null,
      direction: 'inbound',
      providerMessageId: `wamid.${randomUUID()}`,
      status: 'delivered',
      occurredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })

    const advanceJobs = queue.enqueued.filter((job) => job.name === JOB_NAMES.FLOWS_ADVANCE_SESSION)
    assert.lengthOf(advanceJobs, 1)
    assert.equal(advanceJobs[0]?.options?.singletonKey, fixture.conversationId)
    assert.isTrue(advanceJobs[0]?.options?.runAt instanceof Date)

    await drainFlowAdvanceJobs(queue)

    const session = await runWithTenant(organizationId, () =>
      db
        .from('flow_sessions')
        .where('organizationId', organizationId)
        .where('conversationId', fixture.conversationId)
        .first()
    )
    assert.isNotNull(session)
    assert.equal(session!.status, FlowSessionStatus.WAITING_FOR_INPUT)
    assert.equal(session!.currentNodeId, 'menu')

    const outboundTexts = await runWithTenant(organizationId, () =>
      db
        .from('messages')
        .where('organizationId', organizationId)
        .where('conversationId', fixture.conversationId)
        .where('senderType', 'system')
        .orderBy('createdAt', 'asc')
        .select('contentType', 'contentText')
    )
    assert.isTrue(
      outboundTexts.some(
        (row) => row.contentType === 'text' && String(row.contentText).includes(fixture.contactName)
      )
    )
    assert.isTrue(outboundTexts.some((row) => row.contentType === 'interactive'))

    const replyMessageId = randomUUID()
    await InboxMessageReceived.dispatch({
      organizationId,
      conversationId: fixture.conversationId,
      messageId: replyMessageId,
      whatsappConfigId: randomUUID(),
      contactId: fixture.contactId,
      contentType: 'interactive',
      contentText: 'OK',
      interactiveReplyId: 'btn_ok',
      direction: 'inbound',
      providerMessageId: `wamid.${randomUUID()}`,
      status: 'delivered',
      occurredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })

    assert.lengthOf(
      queue.enqueued.filter((job) => job.name === JOB_NAMES.FLOWS_ADVANCE_SESSION),
      1
    )
    assert.isUndefined(
      queue.enqueued.find((job) => job.name === JOB_NAMES.FLOWS_ADVANCE_SESSION)?.options?.runAt
    )

    await drainFlowAdvanceJobs(queue)

    const finished = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(finished!.status, FlowSessionStatus.COMPLETED)
    assert.equal(finished!.currentNodeId, 'exit')

    const thanks = await runWithTenant(organizationId, () =>
      db
        .from('messages')
        .where('organizationId', organizationId)
        .where('conversationId', fixture.conversationId)
        .where('contentText', 'Thanks!')
        .first()
    )
    assert.isNotNull(thanks)

    const logs = await runWithTenant(organizationId, () =>
      db.from('flow_execution_logs').where('flowSessionId', session!.id).orderBy('createdAt', 'asc')
    )
    assert.isAbove(logs.length, 3)
  })

  test('BACK pops submenu to root menu frame', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const { fixture, session } = await startAtMenu({
      organizationId,
      queue,
      graph: nestedNavGraph(),
    })
    assert.isNotNull(session)
    assert.equal(session!.currentNodeId, 'menu')
    assert.lengthOf(parseStack(session!.callStack), 1)

    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'Products',
      interactiveReplyId: 'btn_products',
    })
    await drainFlowAdvanceJobs(queue)

    const atSubmenu = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(atSubmenu!.status, FlowSessionStatus.WAITING_FOR_INPUT)
    assert.equal(atSubmenu!.currentNodeId, 'submenu')
    assert.lengthOf(parseStack(atSubmenu!.callStack), 2)

    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'Back',
      interactiveReplyId: 'btn_back',
    })
    await drainFlowAdvanceJobs(queue)

    const afterBack = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(afterBack!.status, FlowSessionStatus.WAITING_FOR_INPUT)
    assert.equal(afterBack!.currentNodeId, 'menu')
    assert.lengthOf(parseStack(afterBack!.callStack), 1)

    const navLog = await runWithTenant(organizationId, () =>
      db
        .from('flow_execution_logs')
        .where('flowSessionId', session!.id)
        .where('actionTaken', 'NAV_BACK')
        .first()
    )
    assert.isNotNull(navLog)
  })

  test('MAIN_MENU unwinds stack to root frame', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const { fixture, session } = await startAtMenu({
      organizationId,
      queue,
      graph: nestedNavGraph(),
    })
    assert.isNotNull(session)

    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'Products',
      interactiveReplyId: 'btn_products',
    })
    await drainFlowAdvanceJobs(queue)

    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'Main',
      interactiveReplyId: 'btn_main',
    })
    await drainFlowAdvanceJobs(queue)

    const afterMain = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(afterMain!.status, FlowSessionStatus.WAITING_FOR_INPUT)
    assert.equal(afterMain!.currentNodeId, 'menu')
    assert.lengthOf(parseStack(afterMain!.callStack), 1)

    const navLog = await runWithTenant(organizationId, () =>
      db
        .from('flow_execution_logs')
        .where('flowSessionId', session!.id)
        .where('actionTaken', 'NAV_MAIN_MENU')
        .first()
    )
    assert.isNotNull(navLog)
  })

  test('STOP terminates with farewell and records contact opt-out', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const { fixture, session } = await startAtMenu({ organizationId, queue })
    assert.isNotNull(session)

    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'Stop',
      interactiveReplyId: 'btn_stop',
    })
    await drainFlowAdvanceJobs(queue)

    const finished = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(finished!.status, FlowSessionStatus.TERMINATED)

    const farewell = await runWithTenant(organizationId, () =>
      db
        .from('messages')
        .where('organizationId', organizationId)
        .where('conversationId', fixture.conversationId)
        .where('contentText', FLOW_STOP_FAREWELL)
        .first()
    )
    assert.isNotNull(farewell)

    const contact = await runWithTenant(organizationId, () =>
      db.from('contacts').where('id', fixture.contactId).first()
    )
    assert.equal(contact!.marketingOptIn, false)
    assert.isNotNull(contact!.optedOutAt)

    const consent = await runWithTenant(organizationId, () =>
      db
        .from('contact_consent_events')
        .where('organizationId', organizationId)
        .where('contactId', fixture.contactId)
        .where('eventType', 'opt_out')
        .where('source', 'keyword')
        .first()
    )
    assert.isNotNull(consent)
  })

  test('CONDITION follows the matching branch then fallback', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const fixture = await seedConversation(organizationId)
    await seedPublishedFlow(organizationId, conditionGraph())

    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'hi',
    })
    await drainFlowAdvanceJobs(queue)

    const waiting = await runWithTenant(organizationId, () =>
      db
        .from('flow_sessions')
        .where('organizationId', organizationId)
        .where('conversationId', fixture.conversationId)
        .first()
    )
    assert.equal(waiting!.status, FlowSessionStatus.WAITING_FOR_INPUT)
    assert.equal(waiting!.currentNodeId, 'ask')

    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'vip',
    })
    await drainFlowAdvanceJobs(queue)

    const vipDone = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', waiting!.id).first()
    )
    assert.equal(vipDone!.status, FlowSessionStatus.COMPLETED)
    const vipMsg = await runWithTenant(organizationId, () =>
      db
        .from('messages')
        .where('organizationId', organizationId)
        .where('contentText', 'VIP path')
        .first()
    )
    assert.isNotNull(vipMsg)

    const org2 = await createOrg()
    orgIds.push(org2)
    const fixture2 = await seedConversation(org2)
    await seedPublishedFlow(org2, conditionGraph())
    await dispatchInbound({
      organizationId: org2,
      conversationId: fixture2.conversationId,
      contactId: fixture2.contactId,
      contentText: 'hi',
    })
    await drainFlowAdvanceJobs(queue)
    const waiting2 = await runWithTenant(org2, () =>
      db.from('flow_sessions').where('conversationId', fixture2.conversationId).first()
    )
    await dispatchInbound({
      organizationId: org2,
      conversationId: fixture2.conversationId,
      contactId: fixture2.contactId,
      contentText: 'basic',
    })
    await drainFlowAdvanceJobs(queue)
    const otherDone = await runWithTenant(org2, () =>
      db.from('flow_sessions').where('id', waiting2!.id).first()
    )
    assert.equal(otherDone!.status, FlowSessionStatus.COMPLETED)
    const otherMsg = await runWithTenant(org2, () =>
      db.from('messages').where('organizationId', org2).where('contentText', 'Other path').first()
    )
    assert.isNotNull(otherMsg)
  })

  test('BACK at a subflow root returns to the parent caller continuation', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const child = await seedPublishedFlow(organizationId, childSubflowGraph(), {
      triggerType: 'SUBFLOW_ENTRY',
      triggerConfig: {},
    })
    await seedPublishedFlow(organizationId, parentSubflowGraph(child.flowId))
    const fixture = await seedConversation(organizationId)

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
    assert.equal(session!.currentNodeId, 'menu')

    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'Go',
      interactiveReplyId: 'btn_go',
    })
    await drainFlowAdvanceJobs(queue)

    const inChild = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(inChild!.status, FlowSessionStatus.WAITING_FOR_INPUT)
    assert.equal(inChild!.currentNodeId, 'submenu')
    assert.equal(inChild!.flowId, child.flowId)

    await dispatchInbound({
      organizationId,
      conversationId: fixture.conversationId,
      contactId: fixture.contactId,
      contentText: 'Back',
      interactiveReplyId: 'btn_back',
    })
    await drainFlowAdvanceJobs(queue)

    const afterBack = await runWithTenant(organizationId, () =>
      db.from('flow_sessions').where('id', session!.id).first()
    )
    assert.equal(afterBack!.status, FlowSessionStatus.COMPLETED)
    assert.equal(afterBack!.currentNodeId, 'exit')
    const returned = await runWithTenant(organizationId, () =>
      db
        .from('messages')
        .where('organizationId', organizationId)
        .where('contentText', 'Returned')
        .first()
    )
    assert.isNotNull(returned)
  })

  test('subflow stack depth limit terminates cleanly', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const placeholder = '00000000-0000-4000-8000-000000000001'
    const seeded = await seedPublishedFlow(organizationId, selfSubflowGraph(placeholder))
    await runWithTenant(organizationId, async () => {
      const graph = selfSubflowGraph(seeded.flowId)
      await db
        .from('flow_versions')
        .where('id', seeded.versionId)
        .update({
          nodes: JSON.stringify(graph.nodes),
          edges: JSON.stringify(graph.edges),
          viewport: JSON.stringify(graph.viewport),
        })
    })

    const fixture = await seedConversation(organizationId)
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
    assert.equal(session!.status, FlowSessionStatus.TERMINATED)
    const depthLog = await runWithTenant(organizationId, () =>
      db
        .from('flow_execution_logs')
        .where('flowSessionId', session!.id)
        .where('actionTaken', 'STACK_DEPTH_EXCEEDED')
        .first()
    )
    assert.isNotNull(depthLog)
  })
})
