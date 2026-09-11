import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { CatalogStatus } from '#enums/catalog_status'
import { CatalogTemplateSource } from '#enums/catalog_template_source'
import { FlowTriggerType } from '#enums/flow_trigger_type'
import { FlowValidationStatus } from '#enums/flow_validation_status'
import { auth } from '#lib/auth'
import { DEFAULT_FLOW_SETTINGS, DEFAULT_FLOW_VIEWPORT, type FlowGraph } from '#lib/flow/flow_graph'
import { PlatformFlowCatalogRepository } from '#repositories/platform_flow_catalog_repository'
import { PlatformTemplateCatalogRepository } from '#repositories/platform_template_catalog_repository'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { PlatformFlowCatalogService } from '#services/platform_flow_catalog_service'
import { runWithTenant } from '#services/tenant_context'

const ADMIN = '/api/v1/super-admin/flow-catalog'
const ORG = '/api/v1/flow-catalog'

async function mintToken(email: string, activeOrgId?: string): Promise<string> {
  const result = (await auth.api.signInEmail({
    body: { email, password: DEMO_PASSWORD },
  })) as { token?: string; user?: { id: string; name: string; email: string } }
  if (!result.token || !result.user?.id) throw new Error(`Failed to sign in ${email}`)
  const sessionRow = await db.from('sessions').where('token', result.token).select('id').first()
  if (!sessionRow?.id) throw new Error(`No session row after sign-in for ${email}`)
  if (activeOrgId) {
    await db.from('sessions').where('id', sessionRow.id).update({ activeOrganizationId: activeOrgId })
  }
  const payload = await new AccessTokenClaimsService().build({
    user: { id: result.user.id, email, name: result.user.name ?? email },
    session: { id: sessionRow.id as string, activeOrganizationId: activeOrgId ?? null },
  })
  const signed = await auth.api.signJWT({
    body: { payload: payload as Record<string, unknown> },
  })
  const token = (signed as { token?: string } | null)?.token
  if (!token) throw new Error(`signJWT returned no token for ${email}`)
  return token
}

function linearMessageGraph(): FlowGraph {
  return {
    nodes: [
      { id: 'trigger', type: 'TRIGGER', data: { label: 'Start' } },
      {
        id: 'message',
        type: 'MESSAGE',
        data: { label: 'Welcome', messageType: 'text', text: 'Hello' },
      },
      { id: 'exit', type: 'EXIT', data: { label: 'Done' } },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'message' },
      { id: 'e2', source: 'message', target: 'exit' },
    ],
    viewport: DEFAULT_FLOW_VIEWPORT,
  }
}

function conditionGraph(): FlowGraph {
  return {
    nodes: [
      { id: 'trigger', type: 'TRIGGER', data: { label: 'Start' } },
      {
        id: 'cond',
        type: 'CONDITION',
        data: {
          fallbackHandle: 'else',
          conditions: [
            { id: 'yes', operator: 'equals', variableKey: 'lastInboundText', value: 'hi' },
          ],
        },
      },
      { id: 'exit', type: 'EXIT', data: { label: 'Done' } },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'cond' },
      { id: 'e2', source: 'cond', sourceHandle: 'yes', target: 'exit' },
      { id: 'e3', source: 'cond', sourceHandle: 'else', target: 'exit' },
    ],
    viewport: DEFAULT_FLOW_VIEWPORT,
  }
}

function aiGraph(): FlowGraph {
  return {
    nodes: [
      { id: 'trigger', type: 'TRIGGER', data: { label: 'Start' } },
      { id: 'rag', type: 'AI_RAG', data: { label: 'Ask' } },
      { id: 'exit', type: 'EXIT', data: { label: 'Done' } },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'rag' },
      { id: 'e2', source: 'rag', target: 'exit' },
    ],
    viewport: DEFAULT_FLOW_VIEWPORT,
  }
}

async function seedCatalogFlow(params: {
  name: string
  requiredFeatureKeys: string[]
  graph: FlowGraph
}) {
  const repo = new PlatformFlowCatalogRepository()
  const row = await repo.insert({
    slug: `${params.name}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: params.name,
    triggerType: FlowTriggerType.KEYWORD,
    triggerConfig: { keywords: ['hi'], matchType: 'exact' },
    settings: DEFAULT_FLOW_SETTINGS,
    requiredFeatureKeys: params.requiredFeatureKeys,
    extraRequiredFeatureKeys: [],
    status: CatalogStatus.DRAFT,
  })
  const version = await repo.insertVersion({
    flowCatalogId: row.id,
    versionNumber: 1,
    graph: params.graph,
    validationStatus: FlowValidationStatus.VALID,
    validationErrors: [],
  })
  const published =
    (await repo.update(row.id, {
      status: CatalogStatus.PUBLISHED,
      publishedVersionId: version.id,
      requiredFeatureKeys: params.requiredFeatureKeys,
    })) ?? row
  return { row: published, version }
}

async function withPlanFeatures<T>(
  features: Array<{ key: string; enabled: boolean; name?: string; category?: string }>,
  fn: () => Promise<T>,
  planId: string = FIXTURE_IDS.plans.growth
): Promise<T> {
  const plan = await db.from('plans').where('id', planId).first()
  const original = plan.metadata
  const metadata = typeof original === 'string' ? JSON.parse(original) : original
  try {
    await db
      .from('plans')
      .where('id', planId)
      .update({ metadata: JSON.stringify({ ...metadata, features }) })
    return await fn()
  } finally {
    await db
      .from('plans')
      .where('id', planId)
      .update({
        metadata: typeof original === 'string' ? original : JSON.stringify(original),
      })
  }
}

test.group('Platform flow catalog HTTP', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.each.teardown(async () => {
    await runWithTenant(FIXTURE_IDS.orgs.northstar, async () => {
      await db.from('flows').whereNotNull('catalogFlowId').delete()
      await db.from('message_templates').whereNotNull('catalogTemplateId').delete()
    })
    await runWithTenant(FIXTURE_IDS.orgs.harbor, async () => {
      await db.from('flows').whereNotNull('catalogFlowId').delete()
      await db.from('message_templates').whereNotNull('catalogTemplateId').delete()
    })
    await db.from('platform_flow_catalog').delete()
    await db.from('platform_template_catalog').delete()
  })

  test('org with only flowBuilder lists basic catalog flow, not CONDITION or AI_RAG', async ({
    client,
    assert,
  }) => {
    const basic = await seedCatalogFlow({
      name: 'basic_welcome',
      requiredFeatureKeys: ['flowBuilder'],
      graph: linearMessageGraph(),
    })
    const advanced = await seedCatalogFlow({
      name: 'branching',
      requiredFeatureKeys: ['flowBuilder', 'flowAdvancedNodes'],
      graph: conditionGraph(),
    })
    const rag = await seedCatalogFlow({
      name: 'ai_helper',
      requiredFeatureKeys: ['flowBuilder', 'flowAdvancedNodes', 'aiAutonomous'],
      graph: aiGraph(),
    })

    await withPlanFeatures(
      [{ key: 'flowBuilder', enabled: true, name: 'Flow Builder', category: 'automation' }],
      async () => {
        const token = await mintToken(DEMO_USERS.northstarOwner, FIXTURE_IDS.orgs.northstar)
        const response = await client.get(ORG).bearerToken(token)
        response.assertStatus(200)
        const ids = (response.body().data as Array<{ id: string }>).map((row) => row.id)
        assert.include(ids, basic.row.id)
        assert.notInclude(ids, advanced.row.id)
        assert.notInclude(ids, rag.row.id)
      }
    )
  })

  test('org with advanced nodes but not AI lists CONDITION, not AI_RAG', async ({
    client,
    assert,
  }) => {
    const advanced = await seedCatalogFlow({
      name: 'branching_2',
      requiredFeatureKeys: ['flowBuilder', 'flowAdvancedNodes'],
      graph: conditionGraph(),
    })
    const rag = await seedCatalogFlow({
      name: 'ai_helper_2',
      requiredFeatureKeys: ['flowBuilder', 'flowAdvancedNodes', 'aiAutonomous'],
      graph: aiGraph(),
    })

    await withPlanFeatures(
      [
        { key: 'flowBuilder', enabled: true },
        { key: 'flowAdvancedNodes', enabled: true },
      ],
      async () => {
        const token = await mintToken(DEMO_USERS.northstarOwner, FIXTURE_IDS.orgs.northstar)
        const response = await client.get(ORG).bearerToken(token)
        const ids = (response.body().data as Array<{ id: string }>).map((row) => row.id)
        assert.include(ids, advanced.row.id)
        assert.notInclude(ids, rag.row.id)
      }
    )
  })

  test('install of a hidden flow returns not found', async ({ client }) => {
    const hidden = await seedCatalogFlow({
      name: 'hidden_ai',
      requiredFeatureKeys: ['flowBuilder', 'flowAdvancedNodes', 'aiAutonomous'],
      graph: aiGraph(),
    })
    await withPlanFeatures([{ key: 'flowBuilder', enabled: true }], async () => {
      const token = await mintToken(DEMO_USERS.northstarOwner, FIXTURE_IDS.orgs.northstar)
      const response = await client.post(`${ORG}/${hidden.row.id}/install`).bearerToken(token)
      response.assertStatus(404)
    })
  })

  test('install remaps catalog template ids onto org clones', async ({ client, assert }) => {
    const template = await new PlatformTemplateCatalogRepository().insert({
      slug: `tpl_${Date.now()}`,
      name: 'catalog_hello',
      category: 'UTILITY',
      language: 'en_US',
      bodyText: 'Hello {{1}}',
      source: CatalogTemplateSource.MANUAL,
      status: CatalogStatus.PUBLISHED,
    })
    const graph: FlowGraph = {
      nodes: [
        { id: 'trigger', type: 'TRIGGER', data: { label: 'Start' } },
        {
          id: 'tpl',
          type: 'TEMPLATE',
          data: { messageTemplateId: template.id },
        },
        { id: 'exit', type: 'EXIT', data: { label: 'Done' } },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'tpl' },
        { id: 'e2', source: 'tpl', target: 'exit' },
      ],
      viewport: DEFAULT_FLOW_VIEWPORT,
    }
    const catalog = await seedCatalogFlow({
      name: 'uses_template',
      requiredFeatureKeys: ['flowBuilder'],
      graph,
    })

    await withPlanFeatures(
      [{ key: 'flowBuilder', enabled: true }],
      async () => {
        const token = await mintToken(DEMO_USERS.harborOwner, FIXTURE_IDS.orgs.harbor)
        const response = await client.post(`${ORG}/${catalog.row.id}/install`).bearerToken(token)
        response.assertStatus(200)
        const flow = response.body().data
        assert.equal(flow.status, 'DRAFT')
        assert.equal(flow.catalogFlowId, catalog.row.id)
        const tplNode = flow.version.nodes.find((node: { id: string }) => node.id === 'tpl')
        assert.notEqual(tplNode.data.messageTemplateId, template.id)
        assert.match(tplNode.data.messageTemplateId, /^[0-9a-f-]{36}$/i)
      },
      FIXTURE_IDS.plans.starter
    )
  })

  test('install remaps catalog subflow ids onto org child flows', async ({ client, assert }) => {
    const child = await seedCatalogFlow({
      name: 'child_menu',
      requiredFeatureKeys: ['flowBuilder'],
      graph: linearMessageGraph(),
    })
    const parentGraph: FlowGraph = {
      nodes: [
        { id: 'trigger', type: 'TRIGGER', data: { label: 'Start' } },
        { id: 'sub', type: 'SUBFLOW', data: { subflowId: child.row.id } },
        { id: 'exit', type: 'EXIT', data: { label: 'Done' } },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'sub' },
        { id: 'e2', source: 'sub', target: 'exit' },
      ],
      viewport: DEFAULT_FLOW_VIEWPORT,
    }
    const parent = await seedCatalogFlow({
      name: 'parent_menu',
      requiredFeatureKeys: ['flowBuilder'],
      graph: parentGraph,
    })

    await withPlanFeatures(
      [{ key: 'flowBuilder', enabled: true }],
      async () => {
        const token = await mintToken(DEMO_USERS.harborOwner, FIXTURE_IDS.orgs.harbor)
        const response = await client.post(`${ORG}/${parent.row.id}/install`).bearerToken(token)
        response.assertStatus(200)
        const subNode = response.body().data.version.nodes.find(
          (node: { id: string }) => node.id === 'sub'
        )
        assert.notEqual(subNode.data.subflowId, child.row.id)

        const childClone = await runWithTenant(FIXTURE_IDS.orgs.harbor, () =>
          db
            .from('flows')
            .where('organizationId', FIXTURE_IDS.orgs.harbor)
            .where('catalogFlowId', child.row.id)
            .first()
        )
        assert.equal(subNode.data.subflowId, childClone.id)
        assert.equal(response.body().data.status, 'DRAFT')
      },
      FIXTURE_IDS.plans.starter
    )
  })

  test('two orgs install independently and cannot read each other clones', async ({
    client,
    assert,
  }) => {
    const catalog = await seedCatalogFlow({
      name: 'shared_flow',
      requiredFeatureKeys: ['flowBuilder'],
      graph: linearMessageGraph(),
    })
    await withPlanFeatures(
      [{ key: 'flowBuilder', enabled: true }],
      async () => {
        const north = await mintToken(DEMO_USERS.northstarOwner, FIXTURE_IDS.orgs.northstar)
        const harbor = await mintToken(DEMO_USERS.harborOwner, FIXTURE_IDS.orgs.harbor)
        const a = await client.post(`${ORG}/${catalog.row.id}/install`).bearerToken(north)
        const b = await client.post(`${ORG}/${catalog.row.id}/install`).bearerToken(harbor)
        a.assertStatus(200)
        b.assertStatus(200)
        assert.notEqual(a.body().data.id, b.body().data.id)

        const peek = await client.get(`/api/v1/flows/${b.body().data.id}`).bearerToken(north)
        peek.assertStatus(404)
      },
      FIXTURE_IDS.plans.starter
    )
  })

  test('super-admin can save an AI_RAG catalog graph without a tenant plan', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const created = await client.post(ADMIN).json({ name: `AI catalog ${Date.now()}` }).bearerToken(token)
    created.assertStatus(200)
    const id = created.body().data.id as string
    const saved = await client
      .patch(`${ADMIN}/${id}`)
      .json(aiGraph())
      .bearerToken(token)
    saved.assertStatus(200)
    assert.includeMembers(saved.body().data.requiredFeatureKeys, [
      'flowBuilder',
      'flowAdvancedNodes',
      'aiAutonomous',
    ])
  })

  test('graph save stores derived requiredFeatureKeys', async ({ assert }) => {
    const actor = FIXTURE_IDS.users.superadmin
    const service = new PlatformFlowCatalogService()
    const created = await service.create({ actorUserId: actor, name: `derive ${Date.now()}` })
    const updated = await service.update({
      id: created.id,
      actorUserId: actor,
      ...conditionGraph(),
    })
    assert.includeMembers(updated.requiredFeatureKeys, ['flowBuilder', 'flowAdvancedNodes'])
    assert.notInclude(updated.requiredFeatureKeys, 'aiAutonomous')
  })
})
