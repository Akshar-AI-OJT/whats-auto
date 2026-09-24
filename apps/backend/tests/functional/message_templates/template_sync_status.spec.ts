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

  test('skips orphan marking when Meta list is empty (avoids mass wipe)', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    await seedConnectedConfig(organizationId)

    const local = await seedTemplate({
      organizationId,
      name: 'ghost_tpl',
      language: 'en_US',
      status: 'pending',
      metaTemplateId: '844567648683774',
    })

    const graphClient = {
      listMessageTemplates: async () => ({ data: [] }),
    } as unknown as MetaGraphClient

    const result = await new MessageTemplateService(graphClient).syncTemplatesFromMeta(
      organizationId
    )
    assert.equal(result.syncedCount, 0)
    assert.equal(result.orphanedCount, 0)

    const updated = await runWithTenant(organizationId, () =>
      db.from('message_templates').where('id', local.id).first()
    )
    assert.equal(String(updated?.status), 'pending')
  })

  test('marks pending as rejected when Meta list is non-empty but omits its id', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    await seedConnectedConfig(organizationId)

    const local = await seedTemplate({
      organizationId,
      name: 'ghost_tpl',
      language: 'en_US',
      status: 'pending',
      metaTemplateId: 'missing-id',
    })

    const graphClient = {
      listMessageTemplates: async () => ({
        data: [
          {
            id: 'other-id',
            name: 'other_tpl',
            category: 'UTILITY',
            language: 'en_US',
            status: 'APPROVED',
            components: [{ type: 'BODY', text: 'Hi' }],
          },
        ],
      }),
    } as unknown as MetaGraphClient

    const result = await new MessageTemplateService(graphClient).syncTemplatesFromMeta(
      organizationId
    )
    assert.equal(result.orphanedCount, 1)

    const updated = await runWithTenant(organizationId, () =>
      db.from('message_templates').where('id', local.id).first()
    )
    assert.equal(String(updated?.status), 'rejected')
    assert.include(String(updated?.submissionError ?? ''), 'orphan')
  })

  test('does not demote approved rows during orphan pass', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    await seedConnectedConfig(organizationId)

    const local = await seedTemplate({
      organizationId,
      name: 'keep_approved',
      language: 'en_US',
      status: 'approved',
      metaTemplateId: 'approved-missing',
    })

    const graphClient = {
      listMessageTemplates: async () => ({
        data: [
          {
            id: 'other-id',
            name: 'other_tpl',
            category: 'UTILITY',
            language: 'en_US',
            status: 'APPROVED',
            components: [{ type: 'BODY', text: 'Hi' }],
          },
        ],
      }),
    } as unknown as MetaGraphClient

    const result = await new MessageTemplateService(graphClient).syncTemplatesFromMeta(
      organizationId
    )
    assert.equal(result.orphanedCount, 0)

    const updated = await runWithTenant(organizationId, () =>
      db.from('message_templates').where('id', local.id).first()
    )
    assert.equal(String(updated?.status), 'approved')
  })

  test('marks pending without metaTemplateId as rejected when Meta list is non-empty', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    await seedConnectedConfig(organizationId)

    const local = await seedTemplate({
      organizationId,
      name: 'never_registered',
      language: 'en_US',
      status: 'pending',
      metaTemplateId: null,
    })

    const graphClient = {
      listMessageTemplates: async () => ({
        data: [
          {
            id: 'other-id',
            name: 'other_tpl',
            category: 'UTILITY',
            language: 'en_US',
            status: 'APPROVED',
            components: [{ type: 'BODY', text: 'Hi' }],
          },
        ],
      }),
    } as unknown as MetaGraphClient

    const result = await new MessageTemplateService(graphClient).syncTemplatesFromMeta(
      organizationId
    )
    assert.equal(result.orphanedCount, 1)

    const updated = await runWithTenant(organizationId, () =>
      db.from('message_templates').where('id', local.id).first()
    )
    assert.equal(String(updated?.status), 'rejected')
  })
})

test.group('MessageTemplateService createTemplate Meta verification', (group) => {
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

  test('keeps pending when Meta create id cannot be loaded yet (deferred verify)', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    await seedConnectedConfig(organizationId)

    const graphClient = {
      createMessageTemplate: async () => ({ id: 'ghost-id', status: 'PENDING' }),
      getMessageTemplate: async () => {
        throw new Error('Unsupported get request')
      },
    } as unknown as MetaGraphClient

    const dto = await new MessageTemplateService(graphClient).createTemplate({
      organizationId,
      name: `verify_defer_${Date.now()}`,
      category: 'UTILITY',
      language: 'en_US',
      bodyText: 'Hello {{1}}',
      sampleValues: { '1': 'Ada' },
      skipCustomTemplatesFeature: true,
    })

    assert.equal(dto.status, 'pending')
    assert.equal(dto.metaTemplateId, 'ghost-id')
    assert.include(String(dto.submissionError ?? ''), 'Unsupported get request')
  })

  test('keeps pending when create id verifies on Meta', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    await seedConnectedConfig(organizationId)

    const graphClient = {
      createMessageTemplate: async () => ({ id: 'live-id', status: 'PENDING' }),
      getMessageTemplate: async () => ({
        id: 'live-id',
        name: 'ok',
        status: 'PENDING',
        language: 'en_US',
      }),
    } as unknown as MetaGraphClient

    const dto = await new MessageTemplateService(graphClient).createTemplate({
      organizationId,
      name: `verify_ok_${Date.now()}`,
      category: 'UTILITY',
      language: 'en_US',
      bodyText: 'Hello {{1}}',
      sampleValues: { '1': 'Ada' },
      skipCustomTemplatesFeature: true,
    })

    assert.equal(dto.status, 'pending')
    assert.equal(dto.metaTemplateId, 'live-id')
  })

  test('rejects when Meta create returns no template id', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    await seedConnectedConfig(organizationId)

    const graphClient = {
      createMessageTemplate: async () => ({ status: 'PENDING' }) as { id: string; status: string },
      getMessageTemplate: async () => {
        throw new Error('should not be called')
      },
    } as unknown as MetaGraphClient

    const dto = await new MessageTemplateService(graphClient).createTemplate({
      organizationId,
      name: `verify_noid_${Date.now()}`,
      category: 'UTILITY',
      language: 'en_US',
      bodyText: 'Hello {{1}}',
      sampleValues: { '1': 'Ada' },
      skipCustomTemplatesFeature: true,
    })

    assert.equal(dto.status, 'rejected')
    assert.isNull(dto.metaTemplateId)
    assert.include(String(dto.submissionError ?? ''), 'no template id')
  })
})
