import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import { MemoryWorkingSetRepository } from '#repositories/memory_working_set_repository'
import RedisMemoryWorkingSetService from '#services/ai/redis_memory_working_set_service'
import type PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `mem-${id.slice(0, 8)}`
  await db.table('organizations').insert({
    id,
    name: `Mem ${slug}`,
    slug,
    email: `${slug}@example.com`,
    country: 'US',
    timezone: 'UTC',
    currency: 'USD',
    status: true,
  })
  return id
}

async function seedThread(organizationId: string, contactWaId: string) {
  return runWithTenant(organizationId, async () => {
    const [config] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId,
        phoneNumberId: `pn-${randomUUID().slice(0, 8)}`,
        wabaId: 'waba-mem',
        accessToken: encryptWhatsappAccessToken('plain-token-test'),
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id'])

    const [contact] = await db
      .table('contacts')
      .insert({
        organizationId,
        phone: contactWaId,
        phoneNormalized: contactWaId.replace(/\D/g, ''),
        name: 'Mem Contact',
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

    const base = Date.now()
    await db.table('messages').insert([
      {
        organizationId,
        conversationId: conversation.id,
        senderType: 'system',
        contentType: 'template',
        contentText: 'campaign blast',
        status: 'sent',
        occurredAt: new Date(base),
      },
      {
        organizationId,
        conversationId: conversation.id,
        senderType: 'contact',
        contentType: 'text',
        contentText: 'first',
        status: 'delivered',
        occurredAt: new Date(base + 1000),
      },
      {
        organizationId,
        conversationId: conversation.id,
        senderType: 'agent',
        contentType: 'text',
        contentText: 'second',
        status: 'sent',
        occurredAt: new Date(base + 2000),
      },
      {
        organizationId,
        conversationId: conversation.id,
        senderType: 'contact',
        contentType: 'text',
        contentText: 'third',
        status: 'delivered',
        occurredAt: new Date(base + 3000),
      },
    ])

    return conversation.id as string
  })
}

test.group('Memory working-set fallback', () => {
  test('loads last N turns from messages and skips system rows', async ({ assert }) => {
    const orgA = await createOrg()
    const orgB = await createOrg()
    const conversationA = await seedThread(orgA, '15551110001')
    const conversationB = await seedThread(orgB, '15551110002')

    const platform = {
      async get() {
        return { workingSetSize: 2 }
      },
    } as unknown as PlatformAiConfigService
    const memory = new RedisMemoryWorkingSetService(
      undefined,
      new MemoryWorkingSetRepository(),
      platform
    )

    const fromA = await memory.getRecentTurns(orgA, conversationA)
    assert.deepEqual(
      fromA.map((turn) => turn.content),
      ['second', 'third']
    )
    assert.equal(fromA[0]?.role, 'assistant')
    assert.equal(fromA[1]?.role, 'user')

    const fromB = await memory.getRecentTurns(orgB, conversationB)
    assert.deepEqual(
      fromB.map((turn) => turn.content),
      ['second', 'third']
    )

    const empty = await memory.getRecentTurns(orgA, conversationB)
    assert.deepEqual(empty, [])
  })
})
