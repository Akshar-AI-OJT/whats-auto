import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { generateApiKey } from '#lib/integrations/api_key_crypto'
import { ApiKeyRepository } from '#repositories/api_key_repository'
import { IntegrationEventRepository } from '#repositories/integration_event_repository'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `int-rls-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Integrations RLS ${slug}`,
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

test.group('Integrations | RLS lookup', () => {
  test('resolve_api_key finds a key without a tenant GUC', async ({ assert }) => {
    const organizationId = await createOrg()
    const generated = generateApiKey()
    const repo = new ApiKeyRepository()

    await runWithTenant(organizationId, async () => {
      await repo.insert({
        organizationId,
        name: 'Shopenup Production',
        keyPrefix: generated.keyPrefix,
        keyHash: generated.keyHash,
        scopes: ['events:write'],
      })
    })

    const resolved = await repo.resolveByHash(generated.keyHash)
    assert.isNotNull(resolved)
    assert.equal(resolved?.organizationId, organizationId)
    assert.deepEqual(resolved?.scopes, ['events:write'])
    assert.isNull(resolved?.revokedAt)

    const listed = await runWithTenant(organizationId, async () => {
      return repo.listForOrg(organizationId)
    })
    assert.equal(listed.length, 1)
    assert.equal(listed[0].keyPrefix, generated.keyPrefix)
  })

  test('api_keys enables FORCE RLS', async ({ assert }) => {
    const result = await db.rawQuery(`
      SELECT c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'api_keys'
    `)
    const rows = ((result as { rows?: unknown }).rows ?? result) as Array<{
      relrowsecurity: boolean
      relforcerowsecurity: boolean
    }>
    assert.isTrue(rows[0]?.relrowsecurity)
    assert.isTrue(rows[0]?.relforcerowsecurity)
  })

  test('duplicate integration events are accepted once', async ({ assert }) => {
    const organizationId = await createOrg()
    const repo = new IntegrationEventRepository()
    const externalEventId = `evt_${randomUUID().slice(0, 8)}`

    const first = await runWithTenant(organizationId, async () => {
      return repo.insertOrGetExisting({
        organizationId,
        provider: 'shopenup',
        externalEventId,
        eventType: 'commerce.order_paid',
        payload: { orderId: '1001' },
      })
    })

    const second = await runWithTenant(organizationId, async () => {
      return repo.insertOrGetExisting({
        organizationId,
        provider: 'shopenup',
        externalEventId,
        eventType: 'commerce.order_paid',
        payload: { orderId: '1001' },
      })
    })

    assert.isTrue(first.inserted)
    assert.isFalse(second.inserted)
    assert.equal(first.row.id, second.row.id)
    assert.equal(first.row.status, 'accepted')
  })
})
