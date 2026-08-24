import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { CampaignService } from '#services/campaign_service'
import { createCampaignValidator, scheduleCampaignValidator } from '#validators/campaign'
import { runWithTenant } from '#services/tenant_context'

async function createOrg(timezone: string) {
  const id = randomUUID()
  const slug = `camp-tz-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Campaign TZ ${slug}`,
      slug,
      email: `${slug}@example.com`,
      country: 'IN',
      timezone,
      currency: 'INR',
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

async function seedRecipient(organizationId: string, campaignId: string) {
  await runWithTenant(organizationId, async () => {
    const phone = `1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
    const [contact] = await db
      .table('contacts')
      .insert({
        organizationId,
        phone,
        phoneNormalized: phone,
        name: 'TZ Contact',
        customFields: {},
      })
      .returning(['id'])

    await new CampaignService().replaceRecipients({
      organizationId,
      campaignId,
      contactIds: [contact.id as string],
    })
  })
}

function wallClock(iso: string, timeZone: string) {
  return DateTime.fromISO(iso, { zone: timeZone })
}

test.group('Campaign scheduledAt timezone', (group) => {
  const orgIds: string[] = []
  const userIds: string[] = []

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
        await db.from('broadcasts').where('organizationId', organizationId).delete()
      })
      await db.from('organizations').where('id', organizationId).delete()
    }
    if (userIds.length > 0) {
      await db.from('users').whereIn('id', userIds).delete()
    }
  })

  test('create stores naive 10:55 PM in the organization timezone as a UTC instant', async ({
    assert,
  }) => {
    const organizationId = await createOrg('Asia/Kolkata')
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const created = await new CampaignService().createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Evening blast',
      scheduledAt: '2099-08-19 22:55:00',
      status: 'scheduled',
    })

    assert.equal(created.scheduledAt, '2099-08-19T17:25:00.000Z')
    const local = wallClock(created.scheduledAt!, 'Asia/Kolkata')
    assert.equal(local.toFormat('hh:mm a'), '10:55 PM')
    assert.equal(local.toISODate(), '2099-08-19')
  })

  test('get and list return the same instant so UI stays at 10:55 PM after refresh', async ({
    assert,
  }) => {
    const organizationId = await createOrg('Asia/Kolkata')
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new CampaignService()

    const created = await service.createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Refresh blast',
      scheduledAt: '2099-08-19T22:55',
      status: 'scheduled',
    })

    const fetched = await service.getCampaignById({
      campaignId: created.id,
      organizationId,
    })
    const listed = await service.listCampaignsPaginated({ organizationId })
    const listedRow = listed.data.find((row) => row.id === created.id)

    assert.equal(fetched.scheduledAt, '2099-08-19T17:25:00.000Z')
    assert.equal(listedRow?.scheduledAt, '2099-08-19T17:25:00.000Z')
    assert.equal(wallClock(fetched.scheduledAt!, 'Asia/Kolkata').toFormat('hh:mm a'), '10:55 PM')
  })

  test('schedule uses an explicit timeZone instead of the organization timezone', async ({
    assert,
  }) => {
    const organizationId = await createOrg('Asia/Kolkata')
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new CampaignService()

    const created = await service.createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Override zone',
      status: 'draft',
    })
    await seedRecipient(organizationId, created.id)

    const scheduled = await service.scheduleCampaign({
      campaignId: created.id,
      organizationId,
      scheduledAt: '2099-08-19 22:55:00',
      timeZone: 'America/New_York',
    })

    assert.equal(scheduled.scheduledAt, '2099-08-20T02:55:00.000Z')
    assert.equal(scheduled.status, 'scheduled')
    assert.equal(wallClock(scheduled.scheduledAt!, 'America/New_York').toFormat('hh:mm a'), '10:55 PM')
  })

  test('update and schedule keep the intended organization-local wall clock', async ({
    assert,
  }) => {
    const organizationId = await createOrg('Asia/Kolkata')
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new CampaignService()

    const created = await service.createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Draft then schedule',
      status: 'draft',
    })
    await seedRecipient(organizationId, created.id)

    const scheduled = await service.scheduleCampaign({
      campaignId: created.id,
      organizationId,
      scheduledAt: '2099-08-19 22:55:00',
    })
    assert.equal(scheduled.scheduledAt, '2099-08-19T17:25:00.000Z')
    assert.equal(scheduled.status, 'scheduled')

    const updated = await service.updateCampaign({
      campaignId: created.id,
      organizationId,
      scheduledAt: '2099-08-19 08:30:00',
    })
    assert.equal(updated.scheduledAt, '2099-08-19T03:00:00.000Z')
    assert.equal(wallClock(updated.scheduledAt!, 'Asia/Kolkata').toFormat('hh:mm a'), '08:30 AM')
  })

  test('does not shift the local date when scheduling just after midnight', async ({ assert }) => {
    const organizationId = await createOrg('Asia/Kolkata')
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const created = await new CampaignService().createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Midnight boundary',
      scheduledAt: '2099-08-20 00:30:00',
      status: 'scheduled',
    })

    assert.equal(created.scheduledAt, '2099-08-19T19:00:00.000Z')
    const local = wallClock(created.scheduledAt!, 'Asia/Kolkata')
    assert.equal(local.toISODate(), '2099-08-20')
    assert.equal(local.toFormat('HH:mm'), '00:30')
  })

  test('does not reinterpret a timezone-aware ISO instant in the organization timezone', async ({
    assert,
  }) => {
    const organizationId = await createOrg('Asia/Kolkata')
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const created = await new CampaignService().createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Already UTC',
      scheduledAt: '2099-08-19T17:25:00.000Z',
      status: 'scheduled',
    })

    assert.equal(created.scheduledAt, '2099-08-19T17:25:00.000Z')
  })

  test('scheduler instant matches the organization-local selection', async ({ assert }) => {
    const organizationId = await createOrg('Asia/Kolkata')
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const created = await new CampaignService().createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'Scheduler instant',
      scheduledAt: '2099-08-19 22:55:00',
      status: 'scheduled',
    })

    const expected = DateTime.fromObject(
      { year: 2099, month: 8, day: 19, hour: 22, minute: 55 },
      { zone: 'Asia/Kolkata' }
    )
    assert.equal(new Date(created.scheduledAt!).getTime(), expected.toMillis())
    assert.isTrue(new Date(created.scheduledAt!).getTime() > Date.now())
  })

  test('non-UTC America/New_York organization keeps 10:55 PM local', async ({ assert }) => {
    const organizationId = await createOrg('America/New_York')
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const created = await new CampaignService().createCampaign({
      organizationId,
      actorUserId: userId,
      name: 'NY evening',
      scheduledAt: '2099-08-19 22:55:00',
      status: 'scheduled',
    })

    assert.equal(created.scheduledAt, '2099-08-20T02:55:00.000Z')
    assert.equal(
      wallClock(created.scheduledAt!, 'America/New_York').toFormat('hh:mm a'),
      '10:55 PM'
    )
  })

  test('validators accept naive local and timezone-aware ISO scheduledAt', async ({ assert }) => {
    const naive = await createCampaignValidator.validate({
      name: 'Naive',
      scheduledAt: '2099-08-19 22:55:00',
    })
    assert.equal(naive.scheduledAt, '2099-08-19 22:55:00')

    const iso = await scheduleCampaignValidator.validate({
      scheduledAt: '2099-08-19T17:25:00.000Z',
    })
    assert.equal(iso.scheduledAt, '2099-08-19T17:25:00.000Z')

    const withZone = await scheduleCampaignValidator.validate({
      scheduledAt: '2099-08-19 22:55:00',
      timeZone: 'America/New_York',
    })
    assert.equal(withZone.scheduledAt, '2099-08-19 22:55:00')
    assert.equal(withZone.timeZone, 'America/New_York')

    const localIso = await createCampaignValidator.validate({
      name: 'Datetime local',
      scheduledAt: '2099-08-19T22:55',
    })
    assert.equal(localIso.scheduledAt, '2099-08-19T22:55')
  })
})
