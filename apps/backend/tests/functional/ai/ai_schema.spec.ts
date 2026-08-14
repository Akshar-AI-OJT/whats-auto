import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { ConversationAiMode } from '#enums/conversation_ai_mode'
import { AiKnowledgeDocumentStatus } from '#enums/ai_knowledge_document_status'
import { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'
import { runWithTenant } from '#services/tenant_context'

async function createOrg(label: string) {
  const id = randomUUID()
  const slug = `ai-schema-${label}-${id.slice(0, 8)}`
  await db.table('organizations').insert({
    id,
    name: `AI Schema ${slug}`,
    slug,
    email: `${slug}@example.com`,
    country: 'US',
    timezone: 'UTC',
    currency: 'USD',
    status: true,
  })
  return id
}

async function cleanupOrg(organizationId: string) {
  await runWithTenant(organizationId, async () => {
    await db.from('organizations').where('id', organizationId).delete()
  })
}

test.group('AI schema', (group) => {
  const orgIds: string[] = []

  group.each.teardown(async () => {
    while (orgIds.length > 0) {
      const id = orgIds.pop()
      if (id) await cleanupOrg(id)
    }
  })

  test('seeds a single platform_ai_configs row readable without tenant GUC', async ({ assert }) => {
    const rows = await db
      .from('platform_ai_configs')
      .select('singletonKey', 'isEnabled', 'modelName')

    assert.lengthOf(rows, 1)
    assert.equal(rows[0].singletonKey, 'default')
    assert.equal(rows[0].isEnabled, true)
    assert.equal(rows[0].modelName, 'gpt-4o-mini')
  })

  test('rejects a second platform_ai_configs singleton', async ({ assert }) => {
    await assert.rejects(async () => {
      await db.table('platform_ai_configs').insert({ singletonKey: 'default' })
    })
  })

  test('isolates knowledge documents between organizations', async ({ assert }) => {
    const orgA = await createOrg('doc-a')
    const orgB = await createOrg('doc-b')
    orgIds.push(orgA, orgB)

    const [docA] = await runWithTenant(orgA, () =>
      db
        .table('ai_knowledge_documents')
        .insert({
          organizationId: orgA,
          title: 'Org A FAQ',
          sourceType: AiKnowledgeSourceType.FILE_TXT,
          status: AiKnowledgeDocumentStatus.PENDING,
        })
        .returning(['id'])
    )

    await runWithTenant(orgB, () =>
      db.table('ai_knowledge_documents').insert({
        organizationId: orgB,
        title: 'Org B FAQ',
        sourceType: AiKnowledgeSourceType.FILE_TXT,
        status: AiKnowledgeDocumentStatus.PENDING,
      })
    )

    const seenByA = await runWithTenant(orgA, () => db.from('ai_knowledge_documents').select('id'))
    const seenByB = await runWithTenant(orgB, () =>
      db.from('ai_knowledge_documents').where('id', docA.id).select('id')
    )
    const seenWithoutTenant = await db.from('ai_knowledge_documents').select('id')

    assert.lengthOf(seenByA, 1)
    assert.equal(seenByA[0].id, docA.id)
    assert.lengthOf(seenByB, 0)
    assert.lengthOf(seenWithoutTenant, 0)
  })

  test('isolates usage logs and defaults conversation aiMode', async ({ assert }) => {
    const orgA = await createOrg('log-a')
    const orgB = await createOrg('log-b')
    orgIds.push(orgA, orgB)

    const conversationId = await runWithTenant(orgA, async () => {
      const [contact] = await db
        .table('contacts')
        .insert({
          organizationId: orgA,
          phone: '+15550001111',
          phoneNormalized: '15550001111',
          name: 'AI Schema Contact',
          customFields: {},
        })
        .returning(['id'])

      const [config] = await db
        .table('whatsapp_configs')
        .insert({
          organizationId: orgA,
          phoneNumberId: `pn-${orgA.slice(0, 8)}`,
          wabaId: 'waba-test',
          accessToken: 'encrypted-test',
          status: 'connected',
          connectedAt: new Date(),
        })
        .returning(['id'])

      const [conversation] = await db
        .table('conversations')
        .insert({
          organizationId: orgA,
          whatsappConfigId: config.id,
          contactId: contact.id,
          status: 'open',
        })
        .returning(['id', 'aiMode'])

      assert.equal(conversation.aiMode, ConversationAiMode.AI_AUTO)

      await db.table('ai_usage_logs').insert({
        organizationId: orgA,
        conversationId: conversation.id,
        modelName: 'gpt-4o-mini',
        latencyMs: 12,
        decision: 'AUTO_REPLIED',
      })

      return conversation.id as string
    })

    const seenByB = await runWithTenant(orgB, () =>
      db.from('ai_usage_logs').where('conversationId', conversationId).select('id')
    )
    assert.lengthOf(seenByB, 0)
  })
})
