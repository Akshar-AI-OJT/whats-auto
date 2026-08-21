import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import ContactException from '#exceptions/contact_exception'
import { ContactService } from '#services/contact_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `contact-phone-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Contact Phone ${slug}`,
      slug,
      email: `${slug}@example.com`,
      country: 'IN',
      timezone: 'Asia/Kolkata',
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

test.group('ContactService phone format', (group) => {
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

  test('stores 10-digit and 91-prefixed numbers as the same 91XXXXXXXXXX contact', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new ContactService()

    const created = await runWithTenant(organizationId, () =>
      service.createContact({
        organizationId,
        actorUserId: userId,
        phone: '9909912691',
        name: 'Ada',
      })
    )

    assert.equal(created.phone, '919909912691')
    assert.equal(created.phoneNormalized, '919909912691')

    try {
      await runWithTenant(organizationId, () =>
        service.createContact({
          organizationId,
          actorUserId: userId,
          phone: '+91 99099 12691',
          name: 'Ada Duplicate',
        })
      )
      assert.fail('expected duplicate phone')
    } catch (error) {
      assert.instanceOf(error, ContactException)
      assert.equal((error as ContactException).code, 'E_CONTACT_PHONE_EXISTS')
    }

    const listed = await runWithTenant(organizationId, () => service.listContacts(organizationId))
    assert.lengthOf(listed, 1)
    assert.equal(listed[0].id, created.id)
  })

  test('rejects invalid contact phones', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new ContactService()

    try {
      await runWithTenant(organizationId, () =>
        service.createContact({
          organizationId,
          actorUserId: userId,
          phone: '15551234567',
        })
      )
      assert.fail('expected invalid phone')
    } catch (error) {
      assert.instanceOf(error, ContactException)
      assert.equal((error as ContactException).code, 'E_CONTACT_PHONE_INVALID')
    }
  })

  test('import normalizes, rejects invalid rows, and skips duplicates', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new ContactService()

    await runWithTenant(organizationId, () =>
      service.createContact({
        organizationId,
        actorUserId: userId,
        phone: '919809912691',
        name: 'Existing',
      })
    )

    const result = await runWithTenant(organizationId, () =>
      service.importContacts({
        organizationId,
        actorUserId: userId,
        contacts: [
          { phone: '9809912691', name: 'Existing 10-digit' },
          { phone: '9876543210', name: 'New' },
          { phone: '12345', name: 'Bad' },
          { phone: '9876543210', name: 'Batch duplicate' },
        ],
      })
    )

    assert.lengthOf(result.imported, 1)
    assert.equal(result.imported[0].phoneNormalized, '919876543210')
    assert.lengthOf(result.failed, 3)
    assert.equal(result.failed[0].code, 'E_CONTACT_PHONE_EXISTS')
    assert.equal(result.failed[1].code, 'E_CONTACT_PHONE_INVALID')
    assert.equal(result.failed[2].code, 'E_CONTACT_PHONE_EXISTS')
  })
})
