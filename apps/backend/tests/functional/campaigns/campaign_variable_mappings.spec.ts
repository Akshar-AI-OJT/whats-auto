import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { CampaignService } from '#services/campaign_service'
import { runWithTenant } from '#services/tenant_context'
import type { CampaignVariableMappings } from '#validators/campaign'

const MAPPINGS: CampaignVariableMappings = {
  customer_name: { source: 'contact_field', field: 'name' },
  order_id: { source: 'custom_field', field: 'order_id' },
  promo_code: { source: 'static', value: 'SUMMER26' },
}

async function createOrg() {
  const id = randomUUID()
  const slug = `camp-map-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Campaign Maps ${slug}`,
      slug,
      email: `${slug}@example.com`,
      country: 'US',
      timezone: 'UTC',
      currency: 'USD',
      status: true,
    })
    .returning(['id'])
  return row.id as string
}

async function seedUser() {
  const id = randomUUID()
  await db.table('users').insert({
    id,
    name: 'Campaign Owner',
    firstname: 'Campaign',
    lastname: 'Owner',
    email: `owner-${id.slice(0, 8)}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return id
}

async function seedContact(organizationId: string) {
  return runWithTenant(organizationId, async () => {
    const phone = `1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
    const [contact] = await db
      .table('contacts')
      .insert({
        organizationId,
        phone,
        phoneNormalized: phone,
        name: 'Recipient Contact',
        customFields: {},
      })
      .returning(['id'])
    return contact.id as string
  })
}

test.group('Campaign variableMappings persistence', (group) => {
  const orgIds: string[] = []
  const userIds: string[] = []

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
        await db.from('broadcast_recipients').where('organizationId', organizationId).delete()
        await db.from('broadcasts').where('organizationId', organizationId).delete()
        await db.from('contacts').where('organizationId', organizationId).delete()
      })
      await db.from('organizations').where('id', organizationId).delete()
    }
    if (userIds.length > 0) {
      await db.from('users').whereIn('id', userIds).delete()
    }
  })

  test('create campaign without variableMappings stores null', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'No mappings',
        status: 'draft',
      })
    )

    assert.isNull(campaign.variableMappings)

    const loaded = await runWithTenant(organizationId, () =>
      new CampaignService().getCampaignById({
        campaignId: campaign.id,
        organizationId,
      })
    )
    assert.isNull(loaded.variableMappings)
  })

  test('create campaign with variableMappings saves and GET returns them', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Mapped',
        status: 'draft',
        variableMappings: MAPPINGS,
      })
    )

    assert.deepEqual(campaign.variableMappings, MAPPINGS)

    const loaded = await runWithTenant(organizationId, () =>
      new CampaignService().getCampaignById({
        campaignId: campaign.id,
        organizationId,
      })
    )
    assert.deepEqual(loaded.variableMappings, MAPPINGS)
  })

  test('PATCH campaign can update and clear variableMappings', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Patch maps',
        status: 'draft',
        variableMappings: MAPPINGS,
      })
    )

    const updated = await runWithTenant(organizationId, () =>
      new CampaignService().updateCampaign({
        campaignId: campaign.id,
        organizationId,
        variableMappings: {
          customer_name: { source: 'contact_field', field: 'email' },
        },
      })
    )
    assert.deepEqual(updated.variableMappings, {
      customer_name: { source: 'contact_field', field: 'email' },
    })
    assert.equal(updated.name, 'Patch maps')

    const cleared = await runWithTenant(organizationId, () =>
      new CampaignService().updateCampaign({
        campaignId: campaign.id,
        organizationId,
        variableMappings: null,
      })
    )
    assert.isNull(cleared.variableMappings)
  })

  test('duplicate copies variableMappings and does not copy recipients', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const contactId = await seedContact(organizationId)

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Source mapped',
        status: 'draft',
        variableMappings: MAPPINGS,
      })
    )

    await runWithTenant(organizationId, () =>
      new CampaignService().replaceRecipients({
        organizationId,
        campaignId: campaign.id,
        contactIds: [contactId],
      })
    )

    const source = await runWithTenant(organizationId, () =>
      new CampaignService().getCampaignById({
        campaignId: campaign.id,
        organizationId,
      })
    )
    assert.equal(source.totalRecipients, 1)

    const clone = await runWithTenant(organizationId, () =>
      new CampaignService().duplicateCampaign({
        campaignId: campaign.id,
        organizationId,
        actorUserId: userId,
      })
    )

    assert.notEqual(clone.id, campaign.id)
    assert.equal(clone.status, 'draft')
    assert.deepEqual(clone.variableMappings, MAPPINGS)
    assert.equal(clone.totalRecipients, 0)

    const cloneRecipients = await runWithTenant(organizationId, () =>
      db.from('broadcast_recipients').where('broadcastId', clone.id)
    )
    assert.lengthOf(cloneRecipients, 0)

    const sourceRecipients = await runWithTenant(organizationId, () =>
      db.from('broadcast_recipients').where('broadcastId', campaign.id)
    )
    assert.lengthOf(sourceRecipients, 1)
  })
})
