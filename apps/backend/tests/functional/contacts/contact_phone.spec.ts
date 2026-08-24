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

  test('normalizes national IN and international input to the same contact', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new ContactService()

    const created = await runWithTenant(organizationId, () =>
      service.createContact({
        organizationId,
        actorUserId: userId,
        phoneNumber: '9876543210',
        countryCode: 'IN',
        name: 'Ada',
      })
    )

    assert.equal(created.phone, '9876543210')
    assert.equal(created.phoneNormalized, '919876543210')

    try {
      await runWithTenant(organizationId, () =>
        service.createContact({
          organizationId,
          actorUserId: userId,
          phoneNumber: '+919876543210',
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

  test('normalizes US and GB national numbers with countryCode', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new ContactService()

    const us = await runWithTenant(organizationId, () =>
      service.createContact({
        organizationId,
        actorUserId: userId,
        phoneNumber: '4155552671',
        countryCode: 'US',
      })
    )
    assert.equal(us.phoneNormalized, '14155552671')

    const gb = await runWithTenant(organizationId, () =>
      service.createContact({
        organizationId,
        actorUserId: userId,
        phoneNumber: '07911123456',
        countryCode: 'GB',
      })
    )
    assert.equal(gb.phoneNormalized, '447911123456')
  })

  test('accepts international numbers without countryCode', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new ContactService()

    const india = await runWithTenant(organizationId, () =>
      service.createContact({
        organizationId,
        actorUserId: userId,
        phoneNumber: '+91 98765 43210',
      })
    )
    assert.equal(india.phoneNormalized, '919876543210')

    const us = await runWithTenant(organizationId, () =>
      service.createContact({
        organizationId,
        actorUserId: userId,
        phoneNumber: '+14155552671',
      })
    )
    assert.equal(us.phoneNormalized, '14155552671')
  })

  test('rejects national numbers without countryCode and invalid input', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new ContactService()

    const cases: { phoneNumber: string; countryCode?: string }[] = [
      { phoneNumber: '9876543210' },
      { phoneNumber: '4155552671' },
      { phoneNumber: '9876543210', countryCode: 'ZZ' },
      { phoneNumber: '12345', countryCode: 'IN' },
      { phoneNumber: 'not-a-phone' },
      { phoneNumber: '' },
    ]

    for (const params of cases) {
      try {
        await runWithTenant(organizationId, () =>
          service.createContact({
            organizationId,
            actorUserId: userId,
            ...params,
          })
        )
        assert.fail(`expected invalid phone for ${JSON.stringify(params)}`)
      } catch (error) {
        assert.instanceOf(error, ContactException)
        assert.equal((error as ContactException).code, 'E_CONTACT_PHONE_INVALID')
      }
    }
  })
})
