import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import TagException from '#exceptions/tag_exception'
import { TagService } from '#services/tag_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `tag-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Tag ${slug}`,
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
    name: 'Tag Owner',
    firstname: 'Tag',
    lastname: 'Owner',
    email: `tag-${id.slice(0, 8)}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return id
}

async function seedContact(organizationId: string, opts: { deletedAt?: Date | null } = {}) {
  return runWithTenant(organizationId, async () => {
    const phone = `1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
    const [row] = await db
      .table('contacts')
      .insert({
        organizationId,
        phone,
        phoneNormalized: phone,
        name: 'Tagged Contact',
        customFields: {},
        deletedAt: opts.deletedAt ?? null,
      })
      .returning(['id'])
    return row.id as string
  })
}

async function seedBroadcast(
  organizationId: string,
  contactIds: string[],
  status = 'draft'
) {
  return runWithTenant(organizationId, async () => {
    const [broadcast] = await db
      .table('broadcasts')
      .insert({
        organizationId,
        name: `Campaign ${randomUUID().slice(0, 8)}`,
        status,
        totalRecipients: contactIds.length,
      })
      .returning(['id'])

    if (contactIds.length > 0) {
      await db.table('broadcast_recipients').insert(
        contactIds.map((contactId) => ({
          organizationId,
          broadcastId: broadcast.id,
          contactId,
          status: 'pending',
          createdAt: new Date(),
        }))
      )
    }

    return broadcast.id as string
  })
}

test.group('TagService', (group) => {
  const orgIds: string[] = []
  const userIds: string[] = []

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
        await db.from('broadcast_recipients').where('organizationId', organizationId).delete()
        await db.from('broadcasts').where('organizationId', organizationId).delete()
        await db.from('contact_tags').where('organizationId', organizationId).delete()
        await db.from('tags').where('organizationId', organizationId).delete()
        await db.from('contacts').where('organizationId', organizationId).delete()
      })
      await db.from('organizations').where('id', organizationId).delete()
    }
    if (userIds.length > 0) {
      await db.from('users').whereIn('id', userIds).delete()
    }
  })

  test('creates, lists, and gets a tag with contactCount 0', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const tags = new TagService()

    const created = await runWithTenant(organizationId, () =>
      tags.createTag({
        organizationId,
        actorUserId,
        name: 'VIP',
        color: '#22C55E',
      })
    )

    assert.equal(created.name, 'VIP')
    assert.equal(created.color, '#22C55E')
    assert.equal(created.organizationId, organizationId)
    assert.equal(created.createdByUserId, actorUserId)
    assert.equal(created.contactCount, 0)
    assert.equal(created.usedInCampaigns, 0)
    assert.isNull(created.description)
    assert.equal(created.status, 'active')

    const listed = await runWithTenant(organizationId, () => tags.listTags(organizationId))
    assert.lengthOf(listed, 1)
    assert.equal(listed[0]!.id, created.id)

    const fetched = await runWithTenant(organizationId, () =>
      tags.getTagById({ organizationId, tagId: created.id })
    )
    assert.equal(fetched.id, created.id)
    assert.equal(fetched.contactCount, 0)
  })

  test('rejects duplicate tag name in the same organization', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const tags = new TagService()

    await runWithTenant(organizationId, () =>
      tags.createTag({ organizationId, actorUserId, name: 'VIP' })
    )

    try {
      await runWithTenant(organizationId, () =>
        tags.createTag({ organizationId, actorUserId, name: 'VIP' })
      )
      assert.fail('expected duplicate name')
    } catch (error) {
      assert.instanceOf(error, TagException)
      assert.equal((error as TagException).code, 'E_TAG_NAME_EXISTS')
      assert.equal((error as TagException).status, 409)
    }
  })

  test('allows the same tag name in another organization', async ({ assert }) => {
    const orgA = await createOrg()
    const orgB = await createOrg()
    orgIds.push(orgA, orgB)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const tags = new TagService()

    await runWithTenant(orgA, () =>
      tags.createTag({ organizationId: orgA, actorUserId, name: 'VIP' })
    )
    const other = await runWithTenant(orgB, () =>
      tags.createTag({ organizationId: orgB, actorUserId, name: 'VIP' })
    )
    assert.equal(other.name, 'VIP')
    assert.equal(other.organizationId, orgB)
  })

  test('treats tag names as case-sensitive', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const tags = new TagService()

    await runWithTenant(organizationId, () =>
      tags.createTag({ organizationId, actorUserId, name: 'VIP' })
    )
    const lower = await runWithTenant(organizationId, () =>
      tags.createTag({ organizationId, actorUserId, name: 'vip' })
    )
    assert.equal(lower.name, 'vip')
  })

  test('does not return another organization tag', async ({ assert }) => {
    const orgA = await createOrg()
    const orgB = await createOrg()
    orgIds.push(orgA, orgB)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const tags = new TagService()

    const tagB = await runWithTenant(orgB, () =>
      tags.createTag({ organizationId: orgB, actorUserId, name: 'Harbor' })
    )

    try {
      await runWithTenant(orgA, () => tags.getTagById({ organizationId: orgA, tagId: tagB.id }))
      assert.fail('expected not found')
    } catch (error) {
      assert.instanceOf(error, TagException)
      assert.equal((error as TagException).code, 'E_TAG_NOT_FOUND')
    }
  })

  test('assigns a contact, rejects duplicates, and lists live members', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const contactId = await seedContact(organizationId)
    const tags = new TagService()

    const tag = await runWithTenant(organizationId, () =>
      tags.createTag({ organizationId, actorUserId, name: 'Wholesale' })
    )

    const assignment = await runWithTenant(organizationId, () =>
      tags.assignContact({ organizationId, tagId: tag.id, contactId })
    )
    assert.equal(assignment.tagId, tag.id)
    assert.equal(assignment.contactId, contactId)
    assert.equal(assignment.organizationId, organizationId)

    try {
      await runWithTenant(organizationId, () =>
        tags.assignContact({ organizationId, tagId: tag.id, contactId })
      )
      assert.fail('expected duplicate assignment')
    } catch (error) {
      assert.instanceOf(error, TagException)
      assert.equal((error as TagException).code, 'E_TAG_ASSIGNMENT_EXISTS')
      assert.equal((error as TagException).status, 409)
    }

    const members = await runWithTenant(organizationId, () =>
      tags.listTagContacts({ organizationId, tagId: tag.id })
    )
    assert.lengthOf(members, 1)
    assert.equal(members[0]!.id, contactId)

    const fetched = await runWithTenant(organizationId, () =>
      tags.getTagById({ organizationId, tagId: tag.id })
    )
    assert.equal(fetched.contactCount, 1)
  })

  test('rejects assigning a missing, foreign, or soft-deleted contact', async ({ assert }) => {
    const orgA = await createOrg()
    const orgB = await createOrg()
    orgIds.push(orgA, orgB)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const foreignContactId = await seedContact(orgB)
    const deletedContactId = await seedContact(orgA, { deletedAt: new Date() })
    const tags = new TagService()

    const tag = await runWithTenant(orgA, () =>
      tags.createTag({ organizationId: orgA, actorUserId, name: 'Assign' })
    )

    const expectInvalid = async (contactId: string) => {
      try {
        await runWithTenant(orgA, () =>
          tags.assignContact({ organizationId: orgA, tagId: tag.id, contactId })
        )
        assert.fail('expected invalid contact')
      } catch (error) {
        assert.instanceOf(error, TagException)
        assert.equal((error as TagException).code, 'E_TAG_INVALID_CONTACT')
        assert.equal((error as TagException).status, 422)
      }
    }

    await expectInvalid(randomUUID())
    await expectInvalid(foreignContactId)
    await expectInvalid(deletedContactId)
  })

  test('excludes soft-deleted contacts from member list and contactCount', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const liveId = await seedContact(organizationId)
    const deletedId = await seedContact(organizationId)
    const tags = new TagService()

    const tag = await runWithTenant(organizationId, () =>
      tags.createTag({ organizationId, actorUserId, name: 'Mix' })
    )

    await runWithTenant(organizationId, () =>
      tags.assignContact({ organizationId, tagId: tag.id, contactId: liveId })
    )
    await runWithTenant(organizationId, () =>
      tags.assignContact({ organizationId, tagId: tag.id, contactId: deletedId })
    )
    await runWithTenant(organizationId, async () => {
      await db.from('contacts').where('id', deletedId).update({ deletedAt: new Date() })
    })

    const members = await runWithTenant(organizationId, () =>
      tags.listTagContacts({ organizationId, tagId: tag.id })
    )
    assert.lengthOf(members, 1)
    assert.equal(members[0]!.id, liveId)

    const fetched = await runWithTenant(organizationId, () =>
      tags.getTagById({ organizationId, tagId: tag.id })
    )
    assert.equal(fetched.contactCount, 1)
  })

  test('removing an assignment is idempotent-fail on missing and does not delete the contact', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const contactId = await seedContact(organizationId)
    const tags = new TagService()

    const tag = await runWithTenant(organizationId, () =>
      tags.createTag({ organizationId, actorUserId, name: 'Remove' })
    )
    await runWithTenant(organizationId, () =>
      tags.assignContact({ organizationId, tagId: tag.id, contactId })
    )

    const result = await runWithTenant(organizationId, () =>
      tags.removeContact({ organizationId, tagId: tag.id, contactId })
    )
    assert.deepEqual(result, { ok: true })

    try {
      await runWithTenant(organizationId, () =>
        tags.removeContact({ organizationId, tagId: tag.id, contactId })
      )
      assert.fail('expected assignment not found')
    } catch (error) {
      assert.equal((error as TagException).code, 'E_TAG_ASSIGNMENT_NOT_FOUND')
    }

    const contact = await runWithTenant(organizationId, () =>
      db.from('contacts').where('id', contactId).select('id').first()
    )
    assert.exists(contact)
  })

  test('deleting a tag cascades contact_tags and does not delete contacts', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const contactId = await seedContact(organizationId)
    const tags = new TagService()

    const tag = await runWithTenant(organizationId, () =>
      tags.createTag({ organizationId, actorUserId, name: 'Cascade' })
    )
    await runWithTenant(organizationId, () =>
      tags.assignContact({ organizationId, tagId: tag.id, contactId })
    )

    const result = await runWithTenant(organizationId, () =>
      tags.deleteTag({ organizationId, tagId: tag.id })
    )
    assert.deepEqual(result, { ok: true })

    const pivot = await runWithTenant(organizationId, () =>
      db.from('contact_tags').where('tagId', tag.id).first()
    )
    assert.isUndefined(pivot)

    const contact = await runWithTenant(organizationId, () =>
      db.from('contacts').where('id', contactId).select('id').first()
    )
    assert.exists(contact)

    try {
      await runWithTenant(organizationId, () => tags.getTagById({ organizationId, tagId: tag.id }))
      assert.fail('expected tag not found')
    } catch (error) {
      assert.equal((error as TagException).code, 'E_TAG_NOT_FOUND')
    }
  })

  test('rejects empty update', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const tags = new TagService()

    const tag = await runWithTenant(organizationId, () =>
      tags.createTag({ organizationId, actorUserId, name: 'Patch' })
    )

    try {
      await runWithTenant(organizationId, () => tags.updateTag({ organizationId, tagId: tag.id }))
      assert.fail('expected empty update')
    } catch (error) {
      assert.equal((error as TagException).code, 'E_TAG_EMPTY_UPDATE')
    }
  })

  test('creates with optional description and defaults status to active', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const tags = new TagService()

    const created = await runWithTenant(organizationId, () =>
      tags.createTag({
        organizationId,
        actorUserId,
        name: 'Described',
        description: '  Wholesale buyers  ',
      })
    )

    assert.equal(created.description, 'Wholesale buyers')
    assert.equal(created.status, 'active')

    const listed = await runWithTenant(organizationId, () => tags.listTags(organizationId))
    assert.equal(listed[0]!.description, 'Wholesale buyers')
    assert.equal(listed[0]!.status, 'active')
  })

  test('updates description-only and status-only without changing name or color', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const tags = new TagService()

    const tag = await runWithTenant(organizationId, () =>
      tags.createTag({
        organizationId,
        actorUserId,
        name: 'Keep',
        color: '#22C55E',
      })
    )

    const described = await runWithTenant(organizationId, () =>
      tags.updateTag({
        organizationId,
        tagId: tag.id,
        description: 'B2B accounts',
      })
    )
    assert.equal(described.name, 'Keep')
    assert.equal(described.color, '#22C55E')
    assert.equal(described.description, 'B2B accounts')
    assert.equal(described.status, 'active')

    const inactivated = await runWithTenant(organizationId, () =>
      tags.updateTag({
        organizationId,
        tagId: tag.id,
        status: 'inactive',
      })
    )
    assert.equal(inactivated.name, 'Keep')
    assert.equal(inactivated.color, '#22C55E')
    assert.equal(inactivated.description, 'B2B accounts')
    assert.equal(inactivated.status, 'inactive')

    const cleared = await runWithTenant(organizationId, () =>
      tags.updateTag({
        organizationId,
        tagId: tag.id,
        description: null,
      })
    )
    assert.isNull(cleared.description)
    assert.equal(cleared.status, 'inactive')
  })

  test('usedInCampaigns is 0 when the tag has no overlapping campaign recipients', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const contactId = await seedContact(organizationId)
    const tags = new TagService()

    const tag = await runWithTenant(organizationId, () =>
      tags.createTag({ organizationId, actorUserId, name: 'Unused' })
    )
    await runWithTenant(organizationId, () =>
      tags.assignContact({ organizationId, tagId: tag.id, contactId })
    )
    await seedBroadcast(organizationId, [await seedContact(organizationId)])

    const fetched = await runWithTenant(organizationId, () =>
      tags.getTagById({ organizationId, tagId: tag.id })
    )
    assert.equal(fetched.usedInCampaigns, 0)
    assert.equal(fetched.contactCount, 1)
  })

  test('usedInCampaigns is 1 when one campaign includes a live tag member', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const contactId = await seedContact(organizationId)
    const tags = new TagService()

    const tag = await runWithTenant(organizationId, () =>
      tags.createTag({ organizationId, actorUserId, name: 'Once' })
    )
    await runWithTenant(organizationId, () =>
      tags.assignContact({ organizationId, tagId: tag.id, contactId })
    )
    await seedBroadcast(organizationId, [contactId])

    const fetched = await runWithTenant(organizationId, () =>
      tags.getTagById({ organizationId, tagId: tag.id })
    )
    assert.equal(fetched.usedInCampaigns, 1)
  })

  test('usedInCampaigns counts a campaign once when several tag members are recipients', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const contactA = await seedContact(organizationId)
    const contactB = await seedContact(organizationId)
    const tags = new TagService()

    const tag = await runWithTenant(organizationId, () =>
      tags.createTag({ organizationId, actorUserId, name: 'Overlap' })
    )
    await runWithTenant(organizationId, () =>
      tags.assignContact({ organizationId, tagId: tag.id, contactId: contactA })
    )
    await runWithTenant(organizationId, () =>
      tags.assignContact({ organizationId, tagId: tag.id, contactId: contactB })
    )
    await seedBroadcast(organizationId, [contactA, contactB])

    const fetched = await runWithTenant(organizationId, () =>
      tags.getTagById({ organizationId, tagId: tag.id })
    )
    assert.equal(fetched.usedInCampaigns, 1)
  })

  test('usedInCampaigns counts distinct campaigns across current tag members', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const contactA = await seedContact(organizationId)
    const contactB = await seedContact(organizationId)
    const contactC = await seedContact(organizationId)
    const tags = new TagService()

    const tag = await runWithTenant(organizationId, () =>
      tags.createTag({ organizationId, actorUserId, name: 'Multi' })
    )
    for (const contactId of [contactA, contactB, contactC]) {
      await runWithTenant(organizationId, () =>
        tags.assignContact({ organizationId, tagId: tag.id, contactId })
      )
    }
    await seedBroadcast(organizationId, [contactA, contactB])
    await seedBroadcast(organizationId, [contactC])
    await seedBroadcast(organizationId, [contactA])

    const listed = await runWithTenant(organizationId, () => tags.listTags(organizationId))
    const fetched = await runWithTenant(organizationId, () =>
      tags.getTagById({ organizationId, tagId: tag.id })
    )
    assert.equal(fetched.usedInCampaigns, 3)
    assert.equal(listed[0]!.usedInCampaigns, 3)
  })

  test('usedInCampaigns ignores soft-deleted contacts and soft-deleted campaigns', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const liveId = await seedContact(organizationId)
    const deletedId = await seedContact(organizationId)
    const tags = new TagService()

    const tag = await runWithTenant(organizationId, () =>
      tags.createTag({ organizationId, actorUserId, name: 'LiveOnly' })
    )
    await runWithTenant(organizationId, () =>
      tags.assignContact({ organizationId, tagId: tag.id, contactId: liveId })
    )
    await runWithTenant(organizationId, () =>
      tags.assignContact({ organizationId, tagId: tag.id, contactId: deletedId })
    )
    await runWithTenant(organizationId, async () => {
      await db.from('contacts').where('id', deletedId).update({ deletedAt: new Date() })
    })
    await seedBroadcast(organizationId, [deletedId])
    await seedBroadcast(organizationId, [liveId], 'deleted')

    const fetched = await runWithTenant(organizationId, () =>
      tags.getTagById({ organizationId, tagId: tag.id })
    )
    assert.equal(fetched.usedInCampaigns, 0)
    assert.equal(fetched.contactCount, 1)
  })

  test('usedInCampaigns does not include another organization campaign', async ({ assert }) => {
    const orgA = await createOrg()
    const orgB = await createOrg()
    orgIds.push(orgA, orgB)
    const actorUserId = await seedUser()
    userIds.push(actorUserId)
    const contactA = await seedContact(orgA)
    const contactB = await seedContact(orgB)
    const tags = new TagService()

    const tagA = await runWithTenant(orgA, () =>
      tags.createTag({ organizationId: orgA, actorUserId, name: 'North' })
    )
    await runWithTenant(orgA, () =>
      tags.assignContact({ organizationId: orgA, tagId: tagA.id, contactId: contactA })
    )
    await seedBroadcast(orgB, [contactB])

    const fetched = await runWithTenant(orgA, () =>
      tags.getTagById({ organizationId: orgA, tagId: tagA.id })
    )
    assert.equal(fetched.usedInCampaigns, 0)
  })
})
