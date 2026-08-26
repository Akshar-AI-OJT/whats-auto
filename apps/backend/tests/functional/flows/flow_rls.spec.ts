import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { FlowStatus } from '#enums/flow_status'
import { runWithTenant } from '#services/tenant_context'

async function createOrg(label: string) {
  const id = randomUUID()
  const slug = `flow-rls-${label}-${id.slice(0, 8)}`
  await db.table('organizations').insert({
    id,
    name: `Flow RLS ${slug}`,
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
    await db.from('flow_execution_logs').where('organizationId', organizationId).delete()
    await db.from('flow_sessions').where('organizationId', organizationId).delete()
    await db
      .from('flows')
      .where('organizationId', organizationId)
      .update({ publishedVersionId: null })
    await db.from('flow_versions').where('organizationId', organizationId).delete()
    await db.from('flows').where('organizationId', organizationId).delete()
    await db.from('organizations').where('id', organizationId).delete()
  })
}

async function assertForceRls(tableName: string, assert: { isTrue: (v: unknown) => void }) {
  const result = await db.rawQuery(
    `
      SELECT c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ?
    `,
    [tableName]
  )
  const rows = ((result as { rows?: unknown }).rows ?? result) as Array<{
    relrowsecurity: boolean
    relforcerowsecurity: boolean
  }>
  assert.isTrue(rows[0]?.relrowsecurity)
  assert.isTrue(rows[0]?.relforcerowsecurity)
}

test.group('Flows | RLS', (group) => {
  const orgIds: string[] = []

  group.each.teardown(async () => {
    while (orgIds.length > 0) {
      const id = orgIds.pop()
      if (id) await cleanupOrg(id)
    }
  })

  test('flows / flow_versions / flow_sessions / flow_execution_logs enable FORCE RLS', async ({
    assert,
  }) => {
    await assertForceRls('flows', assert)
    await assertForceRls('flow_versions', assert)
    await assertForceRls('flow_sessions', assert)
    await assertForceRls('flow_execution_logs', assert)
  })

  test('isolates flows and flow_versions between organizations', async ({ assert }) => {
    const orgA = await createOrg('a')
    const orgB = await createOrg('b')
    orgIds.push(orgA, orgB)

    const [flowA] = await runWithTenant(orgA, () =>
      db
        .table('flows')
        .insert({
          organizationId: orgA,
          name: 'Org A Menu',
          status: FlowStatus.DRAFT,
          triggerType: 'KEYWORD',
          triggerConfig: { keywords: ['menu'], matchType: 'exact' },
          settings: {},
        })
        .returning(['id'])
    )

    await runWithTenant(orgB, () =>
      db.table('flows').insert({
        organizationId: orgB,
        name: 'Org B Menu',
        status: FlowStatus.DRAFT,
        triggerType: 'KEYWORD',
        triggerConfig: {},
        settings: {},
      })
    )

    const seenByA = await runWithTenant(orgA, () => db.from('flows').select('id'))
    const seenByB = await runWithTenant(orgB, () =>
      db.from('flows').where('id', flowA.id).select('id')
    )
    const seenWithoutTenant = await db.from('flows').select('id')

    assert.lengthOf(seenByA, 1)
    assert.equal(seenByA[0].id, flowA.id)
    assert.lengthOf(seenByB, 0)
    assert.lengthOf(seenWithoutTenant, 0)

    const [versionA] = await runWithTenant(orgA, () =>
      db
        .table('flow_versions')
        .insert({
          organizationId: orgA,
          flowId: flowA.id,
          versionNumber: 1,
          nodes: [],
          edges: [],
        })
        .returning(['id'])
    )

    const versionsForB = await runWithTenant(orgB, () =>
      db.from('flow_versions').where('id', versionA.id).select('id')
    )
    const versionsForA = await runWithTenant(orgA, () =>
      db.from('flow_versions').where('id', versionA.id).select('id')
    )

    assert.lengthOf(versionsForB, 0)
    assert.lengthOf(versionsForA, 1)
  })
})
