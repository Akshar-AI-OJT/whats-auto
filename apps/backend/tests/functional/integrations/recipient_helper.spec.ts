import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import type ContactException from '#exceptions/contact_exception'
import type WhatsappOutboundException from '#exceptions/whatsapp_outbound_exception'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import { IntegrationRecipientService } from '#services/integrations/integration_recipient_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `int-rcp-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Integrations recipient ${slug}`,
      slug,
      email: `${slug}@example.com`,
      country: 'IN',
      timezone: 'UTC',
      currency: 'INR',
      status: true,
    })
    .returning(['id'])
  return row.id as string
}

async function seedConnectedConfig(organizationId: string) {
  return runWithTenant(organizationId, async () => {
    const [config] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId,
        phoneNumberId: `pn-rcp-${randomUUID().slice(0, 8)}`,
        wabaId: 'waba-rcp',
        accessToken: encryptWhatsappAccessToken('plain-token-rcp'),
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id'])
    return config.id as string
  })
}

test.group('Integration recipient helper', (group) => {
  const orgIds: string[] = []

  group.each.teardown(async () => {
    while (orgIds.length > 0) {
      const organizationId = orgIds.pop()
      if (organizationId) {
        await runWithTenant(organizationId, async () => {
          await db.from('organizations').where('id', organizationId).delete()
        })
      }
    }
  })

  test('upserts contact and conversation for a connected config', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const whatsappConfigId = await seedConnectedConfig(organizationId)
    const service = new IntegrationRecipientService()

    const first = await service.ensureConversationForPhone({
      organizationId,
      phone: '+91 99999 11111',
      profileName: 'Ada',
    })

    assert.equal(first.whatsappConfigId, whatsappConfigId)

    const second = await service.ensureConversationForPhone({
      organizationId,
      phone: '919999911111',
      profileName: 'Ignored',
    })

    assert.equal(second.contactId, first.contactId)
    assert.equal(second.conversationId, first.conversationId)
    assert.equal(second.whatsappConfigId, first.whatsappConfigId)
  })

  test('rejects when WhatsApp is not connected', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const service = new IntegrationRecipientService()

    try {
      await service.ensureConversationForPhone({
        organizationId,
        phone: '919999911111',
      })
      assert.fail('expected configNotConnected')
    } catch (error) {
      assert.equal((error as WhatsappOutboundException).code, 'E_OUTBOUND_CONFIG_NOT_CONNECTED')
    }
  })

  test('rejects an empty phone', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    await seedConnectedConfig(organizationId)
    const service = new IntegrationRecipientService()

    try {
      await service.ensureConversationForPhone({
        organizationId,
        phone: 'not-a-phone',
      })
      assert.fail('expected invalidPhone')
    } catch (error) {
      assert.equal((error as ContactException).code, 'E_CONTACT_PHONE_INVALID')
    }
  })
})
