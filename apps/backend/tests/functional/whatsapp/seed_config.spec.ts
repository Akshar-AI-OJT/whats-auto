import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import ace from '@adonisjs/core/services/ace'
import db from '@adonisjs/lucid/services/db'
import WhatsappSeedConfig from '../../../commands/whatsapp_seed_config.js'
import { DEMO_USERS } from '#database/demo/credentials'
import DemoSeeder from '#database/seeders/demo_seeder'
import { OrganizationStatus } from '#enums/organization_status'
import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import { runWithTenant } from '#services/tenant_context'

async function execSeedConfig(argv: string[]) {
  const command = await ace.create(WhatsappSeedConfig, argv)
  await command.exec()
  return command
}

async function createPendingOrgOwnedBy(userId: string) {
  const organizationId = randomUUID()
  const slug = `seed-${organizationId.slice(0, 8)}`
  const ownerRoleId = await db
    .from('roles')
    .whereNull('organizationId')
    .where('name', 'owner')
    .select('id')
    .firstOrFail()

  await db.table('organizations').insert({
    id: organizationId,
    name: `Seed ${slug}`,
    slug,
    email: `${slug}@example.com`,
    phone: '+919876543210',
    country: 'IN',
    timezone: 'UTC',
    currency: 'INR',
    status: OrganizationStatus.PENDING_SETUP,
  })

  await db.table('organization_members').insert({
    organizationId,
    userId,
    roleId: ownerRoleId.id,
  })

  return organizationId
}

test.group('whatsapp:seed-config', (group) => {
  const orgIds: string[] = []
  let ownerUserId = ''

  group.setup(async () => {
    if (ace.getState() === 'idle') {
      await ace.boot()
    }
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()
    ownerUserId = owner.id as string
  })

  group.each.teardown(async () => {
    while (orgIds.length > 0) {
      const organizationId = orgIds.pop()
      if (!organizationId) continue
      await runWithTenant(organizationId, async () => {
        await db.from('whatsapp_configs').where('organizationId', organizationId).delete()
        await db.from('organizations').where('id', organizationId).delete()
      })
    }
  })

  test('writes D70 snapshot columns and promotes unpaid org to verified_setup', async ({
    assert,
  }) => {
    const organizationId = await createPendingOrgOwnedBy(ownerUserId)
    orgIds.push(organizationId)
    const phoneNumberId = `pn_seed_${organizationId.slice(0, 8)}`
    const businessId = `biz_seed_${organizationId.slice(0, 8)}`

    const command = await execSeedConfig([
      `--org=${organizationId}`,
      `--phone-number-id=${phoneNumberId}`,
      `--waba-id=waba-seed-1`,
      `--token=plain-seed-token`,
      `--business-id=${businessId}`,
    ])

    command.assertExitCode(0)

    const config = await runWithTenant(organizationId, () =>
      db.from('whatsapp_configs').where('organizationId', organizationId).firstOrFail()
    )
    assert.equal(config.status, 'connected')
    assert.equal(config.metaVerificationStatus, 'verified')
    assert.equal(config.businessId, businessId)
    assert.isNotNull(config.subscribedAppsAt)
    assert.isNotNull(config.registeredAt)

    const org = await db
      .from('organizations')
      .where('id', organizationId)
      .select('status')
      .firstOrFail()
    assert.equal(org.status, OrganizationStatus.VERIFIED_SETUP)
  })

  test('re-run without --business-id keeps an existing businessId', async ({ assert }) => {
    const organizationId = await createPendingOrgOwnedBy(ownerUserId)
    orgIds.push(organizationId)
    const phoneNumberId = `pn_keep_${organizationId.slice(0, 8)}`
    const businessId = `biz_keep_${organizationId.slice(0, 8)}`

    const first = await execSeedConfig([
      `--org=${organizationId}`,
      `--phone-number-id=${phoneNumberId}`,
      `--waba-id=waba-keep-1`,
      `--token=plain-seed-token`,
      `--business-id=${businessId}`,
    ])
    first.assertExitCode(0)

    const second = await execSeedConfig([
      `--org=${organizationId}`,
      `--phone-number-id=${phoneNumberId}`,
      `--waba-id=waba-keep-1`,
      `--token=plain-seed-token-rotated`,
    ])
    second.assertExitCode(0)

    const config = await runWithTenant(organizationId, () =>
      db.from('whatsapp_configs').where('organizationId', organizationId).firstOrFail()
    )
    assert.equal(config.businessId, businessId)
    assert.equal(config.metaVerificationStatus, 'verified')
  })

  test('re-run updates an existing connected config and promotes pending_setup without delete', async ({
    assert,
  }) => {
    const organizationId = await createPendingOrgOwnedBy(ownerUserId)
    orgIds.push(organizationId)
    const phoneNumberId = `pn_old_${organizationId.slice(0, 8)}`

    await runWithTenant(organizationId, async () => {
      await db.table('whatsapp_configs').insert({
        organizationId,
        phoneNumberId,
        wabaId: 'waba-old-1',
        accessToken: encryptWhatsappAccessToken('old-token'),
        status: 'connected',
        connectedAt: new Date(),
      })
    })

    const command = await execSeedConfig([
      `--org=${organizationId}`,
      `--phone-number-id=${phoneNumberId}`,
      `--waba-id=waba-old-1`,
      `--token=rotated-token`,
      `--business-id=biz-backfill`,
    ])
    command.assertExitCode(0)

    const configs = await runWithTenant(organizationId, () =>
      db.from('whatsapp_configs').where('organizationId', organizationId)
    )
    assert.lengthOf(configs, 1)
    assert.equal(configs[0].phoneNumberId, phoneNumberId)
    assert.equal(configs[0].metaVerificationStatus, 'verified')
    assert.equal(configs[0].businessId, 'biz-backfill')

    const org = await db
      .from('organizations')
      .where('id', organizationId)
      .select('status')
      .firstOrFail()
    assert.equal(org.status, OrganizationStatus.VERIFIED_SETUP)
  })

  test('forces organization status to verified_setup from any live status', async ({
    assert,
  }) => {
    const organizationId = await createPendingOrgOwnedBy(ownerUserId)
    orgIds.push(organizationId)
    await db
      .from('organizations')
      .where('id', organizationId)
      .update({ status: OrganizationStatus.ACTIVE })

    const command = await execSeedConfig([
      `--org=${organizationId}`,
      `--phone-number-id=pn_force_${organizationId.slice(0, 8)}`,
      `--waba-id=waba-force-1`,
      `--token=plain-seed-token`,
    ])
    command.assertExitCode(0)

    const org = await db
      .from('organizations')
      .where('id', organizationId)
      .select('status')
      .firstOrFail()
    assert.equal(org.status, OrganizationStatus.VERIFIED_SETUP)
  })
})
