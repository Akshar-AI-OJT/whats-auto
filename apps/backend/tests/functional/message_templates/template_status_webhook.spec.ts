import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import { signMetaWebhookPayload } from '#lib/meta_whatsapp/webhook_signature'
import { MessageTemplateService } from '#services/message_template_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `tpl-wh-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Template Webhook ${slug}`,
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

async function createConnectedConfig(params: {
  organizationId: string
  phoneNumberId: string
  wabaId: string
}) {
  return runWithTenant(params.organizationId, async () => {
    const [row] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId: params.organizationId,
        phoneNumberId: params.phoneNumberId,
        wabaId: params.wabaId,
        accessToken: encryptWhatsappAccessToken('plain-token-tpl-wh'),
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id'])
    return row.id as string
  })
}

async function seedPendingTemplate(params: {
  organizationId: string
  name: string
  language: string
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
        status: 'pending',
        metaTemplateId: params.metaTemplateId ?? null,
        lastSubmittedAt: new Date(),
      })
      .returning(['id', 'status', 'metaTemplateId'])
    return row
  })
}

function signedPayload(payload: Record<string, unknown>) {
  const rawBody = JSON.stringify(payload)
  const signature = signMetaWebhookPayload(rawBody, env.get('META_APP_SECRET').release())
  return { payload, signature, rawBody }
}

test.group('MessageTemplateService.applyStatusFromMetaEvent', (group) => {
  const orgIds: string[] = []

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
        await db.from('organizations').where('id', organizationId).delete()
      })
    }
  })

  test('updates pending → approved by metaTemplateId', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    await createConnectedConfig({
      organizationId,
      phoneNumberId: `pn-${randomUUID().slice(0, 8)}`,
      wabaId: `waba-${randomUUID().slice(0, 8)}`,
    })

    const local = await seedPendingTemplate({
      organizationId,
      name: 'order_confirm',
      language: 'en_US',
      metaTemplateId: '1689556908129832',
    })

    const result = await runWithTenant(organizationId, () =>
      new MessageTemplateService().applyStatusFromMetaEvent({
        organizationId,
        metaTemplateId: '1689556908129832',
        name: 'order_confirm',
        language: 'en_US',
        event: 'APPROVED',
        reason: null,
        category: 'UTILITY',
      })
    )

    assert.isTrue(result.updated)
    assert.equal(result.previousStatus, 'pending')
    assert.equal(result.nextStatus, 'approved')

    const updated = await runWithTenant(organizationId, () =>
      db.from('message_templates').where('id', local.id).first()
    )
    assert.equal(String(updated?.status), 'approved')
  })

  test('falls back to name + language when metaTemplateId missing locally', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)

    const local = await seedPendingTemplate({
      organizationId,
      name: 'hello_world',
      language: 'en_US',
      metaTemplateId: null,
    })

    const result = await runWithTenant(organizationId, () =>
      new MessageTemplateService().applyStatusFromMetaEvent({
        organizationId,
        metaTemplateId: 'meta-new-1',
        name: 'hello_world',
        language: 'en-US',
        event: 'APPROVED',
        reason: null,
        category: null,
      })
    )

    assert.isTrue(result.updated)
    const updated = await runWithTenant(organizationId, () =>
      db.from('message_templates').where('id', local.id).first()
    )
    assert.equal(String(updated?.status), 'approved')
    assert.equal(String(updated?.metaTemplateId), 'meta-new-1')
  })

  test('no-ops when no local row exists', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)

    const result = await runWithTenant(organizationId, () =>
      new MessageTemplateService().applyStatusFromMetaEvent({
        organizationId,
        metaTemplateId: 'missing',
        name: 'ghost',
        language: 'en_US',
        event: 'APPROVED',
        reason: null,
        category: null,
      })
    )

    assert.isFalse(result.updated)
    assert.isNull(result.previousStatus)
  })
})

test.group('WhatsApp webhook template status ingestion', (group) => {
  const orgIds: string[] = []

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
        await db.from('organizations').where('id', organizationId).delete()
      })
    }
  })

  test('signed message_template_status_update flips pending to approved', async ({
    assert,
    client,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const wabaId = `waba-${randomUUID().slice(0, 8)}`
    const phoneNumberId = `pn-${randomUUID().slice(0, 8)}`
    await createConnectedConfig({ organizationId, phoneNumberId, wabaId })

    const local = await seedPendingTemplate({
      organizationId,
      name: 'order_confirmation',
      language: 'en_US',
      metaTemplateId: '1689556908129832',
    })

    const { payload, signature } = signedPayload({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: wabaId,
          time: 1751247548,
          changes: [
            {
              field: 'message_template_status_update',
              value: {
                event: 'APPROVED',
                message_template_id: 1689556908129832,
                message_template_name: 'order_confirmation',
                message_template_language: 'en-US',
                reason: 'NONE',
                message_template_category: 'UTILITY',
              },
            },
          ],
        },
      ],
    })

    const response = await client
      .post('/api/v1/webhooks/whatsapp')
      .header('X-Hub-Signature-256', signature)
      .json(payload)

    response.assertStatus(200)

    const updated = await runWithTenant(organizationId, () =>
      db.from('message_templates').where('id', local.id).first()
    )
    assert.equal(String(updated?.status), 'approved')
  })

  test('signed REJECTED webhook stores rejection reason', async ({ assert, client }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const wabaId = `waba-${randomUUID().slice(0, 8)}`
    await createConnectedConfig({
      organizationId,
      phoneNumberId: `pn-${randomUUID().slice(0, 8)}`,
      wabaId,
    })

    const local = await seedPendingTemplate({
      organizationId,
      name: 'bad_template',
      language: 'en',
      metaTemplateId: 'tmpl-rej-1',
    })

    const { payload, signature } = signedPayload({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: wabaId,
          changes: [
            {
              field: 'message_template_status_update',
              value: {
                event: 'REJECTED',
                message_template_id: 'tmpl-rej-1',
                message_template_name: 'bad_template',
                message_template_language: 'en',
                reason: 'INVALID_FORMAT',
                rejection_info: {
                  reason: 'Adjacent variables.',
                  recommendation: 'Add text between them.',
                },
              },
            },
          ],
        },
      ],
    })

    const response = await client
      .post('/api/v1/webhooks/whatsapp')
      .header('X-Hub-Signature-256', signature)
      .json(payload)

    response.assertStatus(200)

    const updated = await runWithTenant(organizationId, () =>
      db.from('message_templates').where('id', local.id).first()
    )
    assert.equal(String(updated?.status), 'rejected')
    assert.include(String(updated?.rejectionReason ?? ''), 'Adjacent variables.')
  })
})
