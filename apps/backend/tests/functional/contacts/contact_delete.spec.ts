import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import ContactException from '#exceptions/contact_exception'
import { ContactService } from '#services/contact_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `contact-del-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Contact Delete ${slug}`,
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
    name: 'Contact Owner',
    firstname: 'Contact',
    lastname: 'Owner',
    email: `owner-${id.slice(0, 8)}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return id
}

test.group('ContactService.softDeleteContact', (group) => {
  const orgIds: string[] = []
  const userIds: string[] = []

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
        await db.from('contacts').where('organizationId', organizationId).delete()
      })
      await db.from('organizations').where('id', organizationId).delete()
    }
    if (userIds.length > 0) {
      await db.from('users').whereIn('id', userIds).delete()
    }
  })

  test('marks a live contact as deleted and omits it from list', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new ContactService()

    const contact = await runWithTenant(organizationId, () =>
      service.createContact({
        organizationId,
        actorUserId: userId,
        phone: '+15551234001',
        name: 'Ada',
      })
    )

    const result = await runWithTenant(organizationId, () =>
      service.softDeleteContact({ contactId: contact.id, organizationId })
    )
    assert.deepEqual(result, { ok: true })

    const listed = await runWithTenant(organizationId, () => service.listContacts(organizationId))
    assert.isFalse(listed.some((row) => row.id === contact.id))

    const deleted = await runWithTenant(organizationId, () =>
      db.from('contacts').where('id', contact.id).select('deletedAt').first()
    )
    assert.isNotNull(deleted?.deletedAt)
  })

  test('rejects an already deleted contact', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new ContactService()

    const contact = await runWithTenant(organizationId, () =>
      service.createContact({
        organizationId,
        actorUserId: userId,
        phone: '+15551234002',
      })
    )

    await runWithTenant(organizationId, () =>
      service.softDeleteContact({ contactId: contact.id, organizationId })
    )

    try {
      await runWithTenant(organizationId, () =>
        service.softDeleteContact({ contactId: contact.id, organizationId })
      )
      assert.fail('expected already deleted')
    } catch (error) {
      assert.instanceOf(error, ContactException)
      assert.equal((error as ContactException).code, 'E_CONTACT_ALREADY_DELETED')
      assert.equal((error as ContactException).status, 409)
    }
  })

  test('rejects a missing or foreign-organization contact', async ({ assert }) => {
    const organizationId = await createOrg()
    const otherOrgId = await createOrg()
    orgIds.push(organizationId, otherOrgId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new ContactService()

    const foreign = await runWithTenant(otherOrgId, () =>
      service.createContact({
        organizationId: otherOrgId,
        actorUserId: userId,
        phone: '+15551234003',
      })
    )

    try {
      await runWithTenant(organizationId, () =>
        service.softDeleteContact({ contactId: foreign.id, organizationId })
      )
      assert.fail('expected not found for foreign contact')
    } catch (error) {
      assert.instanceOf(error, ContactException)
      assert.equal((error as ContactException).code, 'E_CONTACT_NOT_FOUND')
      assert.equal((error as ContactException).status, 404)
    }

    try {
      await runWithTenant(organizationId, () =>
        service.softDeleteContact({ contactId: randomUUID(), organizationId })
      )
      assert.fail('expected not found for unknown id')
    } catch (error) {
      assert.instanceOf(error, ContactException)
      assert.equal((error as ContactException).code, 'E_CONTACT_NOT_FOUND')
    }

    const stillLive = await runWithTenant(otherOrgId, () => service.listContacts(otherOrgId))
    assert.isTrue(stillLive.some((row) => row.id === foreign.id))
  })

  test('allows reusing the same phone after soft-delete', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new ContactService()
    const phone = '+15551234004'

    const original = await runWithTenant(organizationId, () =>
      service.createContact({
        organizationId,
        actorUserId: userId,
        phone,
        name: 'Original',
      })
    )

    await runWithTenant(organizationId, () =>
      service.softDeleteContact({ contactId: original.id, organizationId })
    )

    const replacement = await runWithTenant(organizationId, () =>
      service.createContact({
        organizationId,
        actorUserId: userId,
        phone,
        name: 'Replacement',
      })
    )

    assert.notEqual(replacement.id, original.id)
    assert.equal(replacement.name, 'Replacement')

    const listed = await runWithTenant(organizationId, () => service.listContacts(organizationId))
    assert.lengthOf(listed, 1)
    assert.equal(listed[0].id, replacement.id)
  })
})
