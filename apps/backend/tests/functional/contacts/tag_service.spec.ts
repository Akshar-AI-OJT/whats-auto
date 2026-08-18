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

test.group('TagService', (group) => {
  const orgIds: string[] = []
  const userIds: string[] = []

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
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
})
