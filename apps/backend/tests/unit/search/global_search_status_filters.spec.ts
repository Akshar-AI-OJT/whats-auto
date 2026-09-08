import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { PERMISSIONS, type Permission } from '#abilities/permissions'
import { FlowStatus } from '#enums/flow_status'
import { GlobalSearchService } from '#services/global_search_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg(label: string) {
  const id = randomUUID()
  const slug = `gs-filt-${label}-${id.slice(0, 8)}`
  await db.table('organizations').insert({
    id,
    name: `GS Filter ${slug}`,
    slug,
    email: `${slug}@example.com`,
    country: 'IN',
    timezone: 'UTC',
    currency: 'INR',
    status: 'active',
  })
  return id
}

async function cleanupOrg(organizationId: string) {
  await runWithTenant(organizationId, async () => {
    await db
      .from('flows')
      .where('organizationId', organizationId)
      .update({ publishedVersionId: null })
    await db.from('flow_versions').where('organizationId', organizationId).delete()
    await db.from('flows').where('organizationId', organizationId).delete()
    await db.from('tags').where('organizationId', organizationId).delete()
    await db.from('organizations').where('id', organizationId).delete()
  })
}

test.group('GlobalSearchService | active/archived filters', (group) => {
  group.tap((t) => t.timeout(30_000))

  const orgIds: string[] = []
  const planIds: string[] = []

  group.each.teardown(async () => {
    while (orgIds.length > 0) {
      const id = orgIds.pop()
      if (id) await cleanupOrg(id)
    }
    if (planIds.length) {
      await db.from('plans').whereIn('id', planIds).delete()
      planIds.length = 0
    }
  })

  test('excludes archived flows and inactive customer groups; scopes by organization', async ({
    assert,
  }) => {
    const orgA = await createOrg('a')
    const orgB = await createOrg('b')
    orgIds.push(orgA, orgB)

    const marker = `GsStat${orgA.slice(0, 6)}`
    const activeFlowId = randomUUID()
    const archivedFlowId = randomUUID()
    const otherOrgFlowId = randomUUID()
    const activeGroupId = randomUUID()
    const inactiveGroupId = randomUUID()
    const otherOrgGroupId = randomUUID()

    await runWithTenant(orgA, async () => {
      await db.table('flows').insert([
        {
          id: activeFlowId,
          organizationId: orgA,
          name: `${marker} Active Flow`,
          description: `${marker} live`,
          status: FlowStatus.PUBLISHED,
          triggerType: 'KEYWORD',
          triggerConfig: {},
          settings: {},
          updatedAt: new Date(),
        },
        {
          id: archivedFlowId,
          organizationId: orgA,
          name: `${marker} Archived Flow`,
          description: `${marker} archived`,
          status: FlowStatus.ARCHIVED,
          triggerType: 'KEYWORD',
          triggerConfig: {},
          settings: {},
          updatedAt: new Date(),
        },
      ])
      await db.table('tags').insert([
        {
          id: activeGroupId,
          organizationId: orgA,
          name: `${marker} Active Group`,
          description: `${marker} group active`,
          status: 'active',
          createdAt: new Date(),
        },
        {
          id: inactiveGroupId,
          organizationId: orgA,
          name: `${marker} Inactive Group`,
          description: `${marker} group inactive`,
          status: 'inactive',
          createdAt: new Date(),
        },
      ])
    })

    await runWithTenant(orgB, async () => {
      await db.table('flows').insert({
        id: otherOrgFlowId,
        organizationId: orgB,
        name: `${marker} Other Org Flow`,
        description: `${marker} other`,
        status: FlowStatus.PUBLISHED,
        triggerType: 'KEYWORD',
        triggerConfig: {},
        settings: {},
        updatedAt: new Date(),
      })
      await db.table('tags').insert({
        id: otherOrgGroupId,
        organizationId: orgB,
        name: `${marker} Other Org Group`,
        description: `${marker} other group`,
        status: 'active',
        createdAt: new Date(),
      })
    })

    const permissions = new Set<Permission>([
      PERMISSIONS.CONTACTS_VIEW,
      PERMISSIONS.AUTOMATIONS_VIEW,
    ])

    const result = await runWithTenant(orgA, () =>
      new GlobalSearchService().searchOrganization({
        query: marker,
        organizationId: orgA,
        permissions,
      })
    )

    const flowIds = result.results.filter((r) => r.type === 'flow').map((r) => r.id)
    const groupIds = result.results.filter((r) => r.type === 'customer_group').map((r) => r.id)

    assert.include(flowIds, activeFlowId)
    assert.notInclude(flowIds, archivedFlowId)
    assert.notInclude(flowIds, otherOrgFlowId)

    assert.include(groupIds, activeGroupId)
    assert.notInclude(groupIds, inactiveGroupId)
    assert.notInclude(groupIds, otherOrgGroupId)
  })

  test('platform plan search returns only isActive plans', async ({ assert }) => {
    const marker = `GsPlan${randomUUID().slice(0, 6)}`
    const activePlanId = randomUUID()
    const inactivePlanId = randomUUID()
    planIds.push(activePlanId, inactivePlanId)

    await db.table('plans').insert([
      {
        id: activePlanId,
        code: `gs_active_${activePlanId.slice(0, 8)}`,
        name: `${marker} Active Plan`,
        description: `${marker} checkoutable`,
        price: 999,
        currency: 'INR',
        billingInterval: 'month',
        billingIntervalCount: 1,
        trialDays: 0,
        gateway: null,
        gatewayPlanId: null,
        limits: {},
        isActive: true,
        sortOrder: 1,
        metadata: {},
      },
      {
        id: inactivePlanId,
        code: `gs_inactive_${inactivePlanId.slice(0, 8)}`,
        name: `${marker} Inactive Plan`,
        description: `${marker} archived draft`,
        price: 999,
        currency: 'INR',
        billingInterval: 'month',
        billingIntervalCount: 1,
        trialDays: 0,
        gateway: null,
        gatewayPlanId: null,
        limits: {},
        isActive: false,
        sortOrder: 2,
        metadata: { status: 'archived' },
      },
    ])

    const result = await new GlobalSearchService().searchPlatform({
      query: marker,
      permissions: new Set<Permission>([PERMISSIONS.PLATFORM_TENANTS_BILLING]),
    })

    const foundPlanIds = result.results.filter((r) => r.type === 'plan').map((r) => r.id)
    assert.include(foundPlanIds, activePlanId)
    assert.notInclude(foundPlanIds, inactivePlanId)
  })
})
