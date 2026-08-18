import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import CampaignException from '#exceptions/campaign_exception'
import { CampaignService } from '#services/campaign_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `camp-rcp-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Campaign Recipients ${slug}`,
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

async function seedContact(organizationId: string, opts?: { deletedAt?: Date | null }) {
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
        deletedAt: opts?.deletedAt ?? null,
      })
      .returning(['id'])
    return contact.id as string
  })
}

test.group('CampaignService.replaceRecipients', (group) => {
  const orgIds: string[] = []
  const userIds: string[] = []

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
        await db.from('contact_tags').where('organizationId', organizationId).delete()
        await db.from('tags').where('organizationId', organizationId).delete()
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

  test('tagId snapshots live tagged contacts and excludes soft-deleted', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const liveA = await seedContact(organizationId)
    const liveB = await seedContact(organizationId)
    const deletedC = await seedContact(organizationId, { deletedAt: new Date() })

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Tag audience',
        status: 'draft',
      })
    )

    const tagId = await runWithTenant(organizationId, async () => {
      const [tag] = await db
        .table('tags')
        .insert({ organizationId, createdByUserId: userId, name: 'VIP' })
        .returning(['id'])
      await db.table('contact_tags').insert([
        { organizationId, tagId: tag.id, contactId: liveA },
        { organizationId, tagId: tag.id, contactId: liveB },
        { organizationId, tagId: tag.id, contactId: deletedC },
      ])
      return tag.id as string
    })

    const updated = await runWithTenant(organizationId, () =>
      new CampaignService().replaceRecipients({
        organizationId,
        campaignId: campaign.id,
        tagId,
      })
    )
    assert.equal(updated.totalRecipients, 2)

    await runWithTenant(organizationId, async () => {
      const recipients = await db.from('broadcast_recipients').where('broadcastId', campaign.id)
      const contactIds = recipients.map((row) => row.contactId).sort()
      assert.deepEqual(contactIds, [liveA, liveB].sort())
    })
  })

  test('tagId rejects missing and foreign tags with E_CAMPAIGN_TAG_NOT_FOUND', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const foreignOrgId = await createOrg()
    orgIds.push(foreignOrgId)
    const userId = await seedUser()
    userIds.push(userId)

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'Missing tag',
        status: 'draft',
      })
    )

    const foreignTagId = await runWithTenant(foreignOrgId, async () => {
      const [tag] = await db
        .table('tags')
        .insert({ organizationId: foreignOrgId, createdByUserId: userId, name: 'VIP' })
        .returning(['id'])
      return tag.id as string
    })

    try {
      await runWithTenant(organizationId, () =>
        new CampaignService().replaceRecipients({
          organizationId,
          campaignId: campaign.id,
          tagId: randomUUID(),
        })
      )
      assert.fail('expected missing tag to reject')
    } catch (error) {
      assert.instanceOf(error, CampaignException)
      assert.equal((error as CampaignException).code, 'E_CAMPAIGN_TAG_NOT_FOUND')
    }

    try {
      await runWithTenant(organizationId, () =>
        new CampaignService().replaceRecipients({
          organizationId,
          campaignId: campaign.id,
          tagId: foreignTagId,
        })
      )
      assert.fail('expected foreign tag to reject')
    } catch (error) {
      assert.instanceOf(error, CampaignException)
      assert.equal((error as CampaignException).code, 'E_CAMPAIGN_TAG_NOT_FOUND')
    }

    await runWithTenant(organizationId, async () => {
      const recipients = await db.from('broadcast_recipients').where('broadcastId', campaign.id)
      assert.lengthOf(recipients, 0)
    })
  })

  test('contactIds still snapshots those contacts (All Contacts path)', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const contactId = await seedContact(organizationId)

    const campaign = await runWithTenant(organizationId, () =>
      new CampaignService().createCampaign({
        organizationId,
        actorUserId: userId,
        name: 'All contacts path',
        status: 'draft',
      })
    )

    const updated = await runWithTenant(organizationId, () =>
      new CampaignService().replaceRecipients({
        organizationId,
        campaignId: campaign.id,
        contactIds: [contactId],
      })
    )
    assert.equal(updated.totalRecipients, 1)

    await runWithTenant(organizationId, async () => {
      const recipient = await db
        .from('broadcast_recipients')
        .where('broadcastId', campaign.id)
        .where('contactId', contactId)
        .first()
      assert.isNotNull(recipient)
      assert.equal(recipient.status, 'pending')
    })
  })
})
