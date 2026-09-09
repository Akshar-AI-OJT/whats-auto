import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { CampaignService } from '#services/campaign_service'
import { listCampaignsValidator } from '#validators/campaign'
import { runWithTenant } from '#services/tenant_context'

function isParsedDate(value: unknown): boolean {
  return value instanceof Date || DateTime.isDateTime(value)
}

async function createOrg() {
  const id = randomUUID()
  const slug = `camp-df-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Campaign Date Filter ${slug}`,
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

async function seedCampaign(params: {
  organizationId: string
  userId: string
  name: string
  createdAt: Date
}) {
  const campaign = await runWithTenant(params.organizationId, () =>
    new CampaignService().createCampaign({
      organizationId: params.organizationId,
      actorUserId: params.userId,
      name: params.name,
      status: 'draft',
    })
  )

  await runWithTenant(params.organizationId, async () => {
    await db.from('broadcasts').where('id', campaign.id).update({ createdAt: params.createdAt })
  })

  return campaign.id
}

test.group('listCampaignsValidator date params', () => {
  test('accepts YYYY-MM-DD startDate and endDate', async ({ assert }) => {
    const payload = await listCampaignsValidator.validate({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    })
    assert.isTrue(isParsedDate(payload.startDate))
    assert.isTrue(isParsedDate(payload.endDate))
  })

  test('rejects invalid startDate and endDate', async ({ assert }) => {
    await assert.rejects(() => listCampaignsValidator.validate({ startDate: 'not-a-date' }))
    await assert.rejects(() => listCampaignsValidator.validate({ endDate: '2026-99-99' }))
    await assert.rejects(() => listCampaignsValidator.validate({ startDate: 'March 1, 2026' }))
  })
})

test.group('CampaignService list date range filter', (group) => {
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

  test('keeps campaigns inside the range and excludes those outside', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const insideId = await seedCampaign({
      organizationId,
      userId,
      name: 'Inside range',
      createdAt: new Date('2026-06-15T12:00:00.000Z'),
    })
    const beforeId = await seedCampaign({
      organizationId,
      userId,
      name: 'Before range',
      createdAt: new Date('2026-01-10T12:00:00.000Z'),
    })
    const afterId = await seedCampaign({
      organizationId,
      userId,
      name: 'After range',
      createdAt: new Date('2026-09-20T12:00:00.000Z'),
    })

    const listed = await runWithTenant(organizationId, () =>
      new CampaignService().listCampaignsPaginated({
        organizationId,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        perPage: 20,
      })
    )

    const ids = listed.data.map((row) => row.id)
    assert.include(ids, insideId)
    assert.notInclude(ids, beforeId)
    assert.notInclude(ids, afterId)
    assert.equal(listed.meta.total, 1)
    assert.equal(listed.meta.currentPage, 1)
    assert.equal(listed.meta.perPage, 20)
    assert.equal(listed.meta.lastPage, 1)

    const vineParams = await listCampaignsValidator.validate({
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      perPage: 20,
    })
    const listedFromVine = await runWithTenant(organizationId, () =>
      new CampaignService().listCampaignsPaginated({
        organizationId,
        ...vineParams,
      })
    )
    assert.equal(listedFromVine.meta.total, 1)
    assert.include(
      listedFromVine.data.map((row) => row.id),
      insideId
    )
  })

  test('pagination meta.total reflects the filtered set', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const inRange: string[] = []
    for (let index = 0; index < 3; index++) {
      inRange.push(
        await seedCampaign({
          organizationId,
          userId,
          name: `June campaign ${index + 1}`,
          createdAt: new Date(`2026-06-1${index + 1}T12:00:00.000Z`),
        })
      )
    }
    await seedCampaign({
      organizationId,
      userId,
      name: 'January outsider',
      createdAt: new Date('2026-01-05T12:00:00.000Z'),
    })

    const page1 = await runWithTenant(organizationId, () =>
      new CampaignService().listCampaignsPaginated({
        organizationId,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        page: 1,
        perPage: 2,
      })
    )
    const page2 = await runWithTenant(organizationId, () =>
      new CampaignService().listCampaignsPaginated({
        organizationId,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        page: 2,
        perPage: 2,
      })
    )

    assert.equal(page1.meta.total, 3)
    assert.equal(page1.meta.perPage, 2)
    assert.equal(page1.meta.currentPage, 1)
    assert.equal(page1.meta.lastPage, 2)
    assert.equal(page1.data.length, 2)
    assert.equal(page2.meta.total, 3)
    assert.equal(page2.meta.currentPage, 2)
    assert.equal(page2.data.length, 1)

    const page1Ids = new Set(page1.data.map((row) => row.id))
    assert.isFalse(page1Ids.has(page2.data[0]!.id))
    assert.isTrue(page1.data.every((row) => inRange.includes(row.id)))
    assert.isTrue(inRange.includes(page2.data[0]!.id))
  })

  test('does not return campaigns from another organization', async ({ assert }) => {
    const organizationId = await createOrg()
    const foreignOrgId = await createOrg()
    orgIds.push(organizationId, foreignOrgId)
    const userId = await seedUser()
    userIds.push(userId)

    const ownId = await seedCampaign({
      organizationId,
      userId,
      name: 'Own June campaign',
      createdAt: new Date('2026-06-15T12:00:00.000Z'),
    })
    const foreignId = await seedCampaign({
      organizationId: foreignOrgId,
      userId,
      name: 'Foreign June campaign',
      createdAt: new Date('2026-06-15T12:00:00.000Z'),
    })

    const listed = await runWithTenant(organizationId, () =>
      new CampaignService().listCampaignsPaginated({
        organizationId,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        perPage: 20,
      })
    )

    const ids = listed.data.map((row) => row.id)
    assert.include(ids, ownId)
    assert.notInclude(ids, foreignId)
    assert.equal(listed.meta.total, 1)
    assert.isTrue(listed.data.every((row) => row.organizationId === organizationId))
  })
})
