import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import type { MetaGraphClient } from '#lib/meta_whatsapp/graph_client'
import { MessageTemplateService } from '#services/message_template_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `tpl-sync-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Template Sync ${slug}`,
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

async function seedConnectedConfig(organizationId: string) {
  return runWithTenant(organizationId, async () => {
    const [row] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId,
        phoneNumberId: `pn-${organizationId.slice(0, 8)}`,
        wabaId: `waba-${organizationId.slice(0, 8)}`,
        accessToken: encryptWhatsappAccessToken('plain-token-tpl-sync'),
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id'])
    return row.id as string
  })
}

async function seedTemplate(params: {
  organizationId: string
  name: string
  language: string
  status: string
  metaTemplateId?: string | null
}) {
  return runWithTenant(params.organizationId, async () => {
    const [row] = await db
      .table('message_templates')
      .insert({
        organizationId: params.organizationId,
        name: params.name,
        category: 'UTILITY',
        language: params.language,
        headerType: 'none',
        bodyText: 'Hello {{1}}',
        parameterSchema: {
          headerNames: [],
          bodyNames: ['1'],
          sendable: true,
        },
        status: params.status,
        metaTemplateId: params.metaTemplateId ?? null,
        lastSubmittedAt: new Date(),
      })
      .returning(['id', 'status', 'metaTemplateId', 'name', 'language'])
    return row
  })
}

test.group('MessageTemplateService syncTemplatesFromMeta status', (group) => {
  const orgIds: string[] = []

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
        await db.from('message_templates').where('organizationId', organizationId).delete()
        await db.from('whatsapp_configs').where('organizationId', organizationId).delete()
      })
      await db.from('organizations').where('id', organizationId).delete()
    }
  })

  test('updates local pending → approved when Meta list returns APPROVED', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    await seedConnectedConfig(organizationId)

    const local = await seedTemplate({
      organizationId,
      name: 'order_confirm',
      language: 'en_US',
      status: 'pending',
      metaTemplateId: 'meta-tpl-1',
    })

    const graphClient = {
      listMessageTemplates: async () => ({
        data: [
          {
            id: 'meta-tpl-1',
            name: 'order_confirm',
            category: 'UTILITY',
            language: 'en_US',
            status: 'APPROVED',
            components: [{ type: 'BODY', text: 'Hello {{1}}' }],
          },
        ],
      }),
    } as unknown as MetaGraphClient

    const result = await new MessageTemplateService(graphClient).syncTemplatesFromMeta(
      organizationId
    )
    assert.equal(result.syncedCount, 1)

    const updated = await runWithTenant(organizationId, () =>
      db.from('message_templates').where('id', local.id).first()
    )
    assert.equal(String(updated?.status), 'approved')
    assert.equal(String(updated?.metaTemplateId), 'meta-tpl-1')
  })

  test('leaves local pending when Meta list still returns PENDING', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    await seedConnectedConfig(organizationId)

    const local = await seedTemplate({
      organizationId,
      name: 'still_waiting',
      language: 'en_US',
      status: 'pending',
      metaTemplateId: 'meta-tpl-pending',
    })

    const graphClient = {
      listMessageTemplates: async () => ({
        data: [
          {
            id: 'meta-tpl-pending',
            name: 'still_waiting',
            category: 'UTILITY',
            language: 'en_US',
            status: 'PENDING',
            components: [{ type: 'BODY', text: 'Hello {{1}}' }],
          },
        ],
      }),
    } as unknown as MetaGraphClient

    await new MessageTemplateService(graphClient).syncTemplatesFromMeta(organizationId)

    const updated = await runWithTenant(organizationId, () =>
      db.from('message_templates').where('id', local.id).first()
    )
    assert.equal(String(updated?.status), 'pending')
  })

  test('name+language mismatch leaves stale pending and inserts a second approved row', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    await seedConnectedConfig(organizationId)

    const local = await seedTemplate({
      organizationId,
      name: 'dup_risk',
      language: 'en',
      status: 'pending',
      metaTemplateId: 'meta-tpl-dup',
    })

    const graphClient = {
      listMessageTemplates: async () => ({
        data: [
          {
            id: 'meta-tpl-dup',
            name: 'dup_risk',
            category: 'UTILITY',
            language: 'en_US',
            status: 'APPROVED',
            components: [{ type: 'BODY', text: 'Hello {{1}}' }],
          },
        ],
      }),
    } as unknown as MetaGraphClient

    await new MessageTemplateService(graphClient).syncTemplatesFromMeta(organizationId)

    const rows = await runWithTenant(organizationId, () =>
      db.from('message_templates').where('organizationId', organizationId).orderBy('createdAt')
    )

    assert.lengthOf(rows, 2)
    const stale = rows.find((r) => r.id === local.id)
    const inserted = rows.find((r) => r.id !== local.id)
    assert.equal(String(stale?.status), 'pending')
    assert.equal(String(stale?.language), 'en')
    assert.equal(String(inserted?.status), 'approved')
    assert.equal(String(inserted?.language), 'en_US')
  })
})
