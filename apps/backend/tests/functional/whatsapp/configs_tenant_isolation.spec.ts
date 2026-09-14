import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import WhatsappConfigException from '#exceptions/whatsapp_config_exception'
import { WhatsappConfigService } from '#services/whatsapp_config_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg(label: string) {
  const id = randomUUID()
  const slug = `wa-cfg-${label}-${id.slice(0, 8)}`
  await db.table('organizations').insert({
    id,
    name: `WA Config ${slug}`,
    slug,
    email: `${slug}@example.com`,
    country: 'IN',
    timezone: 'UTC',
    currency: 'INR',
    status: 'active',
  })
  return id
}

async function createConfig(organizationId: string, phoneNumberId: string) {
  return runWithTenant(organizationId, async () => {
    const [row] = await db
      .table('whatsapp_configs')
      .insert({
        organizationId,
        phoneNumberId,
        wabaId: 'waba-test',
        accessToken: encryptWhatsappAccessToken('plain-token-test'),
        status: 'connected',
        connectedAt: new Date(),
      })
      .returning(['id'])
    return row.id as string
  })
}

test.group('WhatsappConfigService tenant isolation', () => {
  test('listConfigs returns only the requested organization rows', async ({ assert }) => {
    const orgA = await createOrg('a')
    const orgB = await createOrg('b')
    const configA = await createConfig(orgA, `pn_a_${orgA.slice(0, 8)}`)
    await createConfig(orgB, `pn_b_${orgB.slice(0, 8)}`)

    const service = new WhatsappConfigService()
    const listed = await runWithTenant(orgA, () => service.listConfigs(orgA))

    assert.lengthOf(listed, 1)
    assert.equal(listed[0].id, configA)
    assert.equal(listed[0].organizationId, orgA)
    assert.isTrue(listed.every((row) => row.organizationId === orgA))
  })

  test('getConfig rejects a config that belongs to another organization', async ({ assert }) => {
    const orgA = await createOrg('get-a')
    const orgB = await createOrg('get-b')
    const configB = await createConfig(orgB, `pn_get_b_${orgB.slice(0, 8)}`)

    const service = new WhatsappConfigService()

    try {
      await runWithTenant(orgA, () => service.getConfig(configB, orgA))
      assert.fail('expected not found')
    } catch (error) {
      assert.instanceOf(error, WhatsappConfigException)
      assert.equal((error as WhatsappConfigException).code, 'E_WA_CONFIG_NOT_FOUND')
    }
  })

  test('disconnect rejects a foreign organization config id', async ({ assert }) => {
    const orgA = await createOrg('disc-a')
    const orgB = await createOrg('disc-b')
    const configB = await createConfig(orgB, `pn_disc_b_${orgB.slice(0, 8)}`)

    const service = new WhatsappConfigService()

    await assert.rejects(async () => {
      await runWithTenant(orgA, () => service.disconnect(configB, orgA))
    }, /WhatsApp config not found/)

    const stillConnected = await runWithTenant(orgB, () => service.getConfig(configB, orgB))
    assert.equal(stillConnected.status, 'connected')
  })
})
