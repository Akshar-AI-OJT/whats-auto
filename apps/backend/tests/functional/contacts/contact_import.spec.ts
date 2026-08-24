import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import ContactException from '#exceptions/contact_exception'
import { ContactImportService } from '#services/contact_import_service'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `contact-import-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Contact Import ${slug}`,
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
    name: 'Import Owner',
    firstname: 'Import',
    lastname: 'Owner',
    email: `import-${id.slice(0, 8)}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return id
}

test.group('ContactImportService', (group) => {
  const orgIds: string[] = []
  const userIds: string[] = []

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
        await db.from('contact_import_rows').where('organizationId', organizationId).delete()
        await db.from('contact_imports').where('organizationId', organizationId).delete()
        await db.from('contacts').where('organizationId', organizationId).delete()
      })
      await db.from('organizations').where('id', organizationId).delete()
    }
    if (userIds.length > 0) {
      await db.from('users').whereIn('id', userIds).delete()
    }
  })

  test('imports international CSV without a default country', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const result = await runWithTenant(organizationId, () =>
      new ContactImportService().importCsv({
        organizationId,
        actorUserId: userId,
        fileName: 'intl.csv',
        csvContent: [
          'name,phone',
          'Rahul,+919876543210',
          'John,+14155552671',
          'David,+447911123456',
        ].join('\n'),
      })
    )

    assert.equal(result.status, 'completed')
    assert.equal(result.successCount, 3)
    assert.equal(result.errorCount, 0)
    assert.equal(result.totalRows, 3)
    const byName = Object.fromEntries(result.rows.map((row) => [row.rawData.name, row]))
    assert.equal(byName.Rahul?.action, 'inserted')
    assert.isNotNull(byName.Rahul?.contactId)

    const contacts = await runWithTenant(organizationId, () =>
      db
        .from('contacts')
        .where('organizationId', organizationId)
        .whereNull('deletedAt')
        .select('name', 'phoneNormalized')
    )
    const normalized = Object.fromEntries(contacts.map((row) => [row.name, row.phoneNormalized]))
    assert.equal(normalized.Rahul, '919876543210')
    assert.equal(normalized.John, '14155552671')
    assert.equal(normalized.David, '447911123456')
  })

  test('imports national CSV using defaultCountryCode', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const india = await runWithTenant(organizationId, () =>
      new ContactImportService().importCsv({
        organizationId,
        actorUserId: userId,
        fileName: 'in.csv',
        defaultCountryCode: 'IN',
        csvContent: 'name,phone\nRahul,9876543210\nPriya,9123456789\n',
      })
    )
    assert.equal(india.defaultCountryCode, 'IN')
    const indiaByName = Object.fromEntries(india.rows.map((row) => [row.rawData.name, row]))
    assert.equal(indiaByName.Rahul?.action, 'inserted')

    const contacts = await runWithTenant(organizationId, () =>
      db
        .from('contacts')
        .where('organizationId', organizationId)
        .whereNull('deletedAt')
        .select('name', 'phoneNormalized')
    )
    const normalized = Object.fromEntries(contacts.map((row) => [row.name, row.phoneNormalized]))
    assert.equal(normalized.Rahul, '919876543210')
    assert.equal(normalized.Priya, '919123456789')

    const us = await runWithTenant(organizationId, () =>
      new ContactImportService().importCsv({
        organizationId,
        actorUserId: userId,
        fileName: 'us.csv',
        defaultCountryCode: 'US',
        csvContent: 'name,phone\nAlex,4155552671\n',
      })
    )
    assert.equal(us.rows[0]?.action, 'inserted')

    const gb = await runWithTenant(organizationId, () =>
      new ContactImportService().importCsv({
        organizationId,
        actorUserId: userId,
        fileName: 'gb.csv',
        defaultCountryCode: 'GB',
        csvContent: 'name,phone\nSam,07911123456\n',
      })
    )
    assert.equal(gb.rows[0]?.action, 'inserted')

    const all = await runWithTenant(organizationId, () =>
      db
        .from('contacts')
        .where('organizationId', organizationId)
        .whereNull('deletedAt')
        .select('name', 'phoneNormalized')
    )
    const allNormalized = Object.fromEntries(all.map((row) => [row.name, row.phoneNormalized]))
    assert.equal(allNormalized.Alex, '14155552671')
    assert.equal(allNormalized.Sam, '447911123456')
  })

  test('mixed CSV uses default country only for national numbers', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const result = await runWithTenant(organizationId, () =>
      new ContactImportService().importCsv({
        organizationId,
        actorUserId: userId,
        fileName: 'mixed.csv',
        defaultCountryCode: 'IN',
        csvContent: [
          'name,phone',
          'Rahul,9876543210',
          'John,+14155552671',
          'David,+447911123456',
        ].join('\n'),
      })
    )

    assert.equal(result.status, 'completed')
    assert.equal(result.successCount, 3)

    const contacts = await runWithTenant(organizationId, () =>
      db
        .from('contacts')
        .where('organizationId', organizationId)
        .whereNull('deletedAt')
        .select('name', 'phoneNormalized')
    )
    const normalized = Object.fromEntries(contacts.map((row) => [row.name, row.phoneNormalized]))
    assert.equal(normalized.Rahul, '919876543210')
    assert.equal(normalized.John, '14155552671')
    assert.equal(normalized.David, '447911123456')
    assert.notEqual(normalized.John, '914155552671')
  })

  test('maps CSV headers onto contact fields', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const result = await runWithTenant(organizationId, () =>
      new ContactImportService().importCsv({
        organizationId,
        actorUserId: userId,
        fileName: 'mapped.csv',
        defaultCountryCode: 'IN',
        columnMapping: {
          phone: 'Mobile Number',
          name: 'Full Name',
          email: 'Email',
          company: 'Company',
        },
        csvContent: [
          'Full Name,Mobile Number,Email,Company',
          'Rahul,9876543210,rahul@example.com,Acme',
        ].join('\n'),
      })
    )

    assert.equal(result.rows[0]?.action, 'inserted')
    const contactId = result.rows[0]?.contactId
    assert.isString(contactId)
    const contact = await runWithTenant(organizationId, () =>
      db
        .from('contacts')
        .where('id', contactId as string)
        .first()
    )
    assert.equal(contact.phoneNormalized, '919876543210')
    assert.equal(contact.name, 'Rahul')
    assert.equal(contact.email, 'rahul@example.com')
    assert.equal(contact.company, 'Acme')
    assert.equal(contact.phone, '9876543210')
  })

  test('fails national rows when no default country is supplied', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const result = await runWithTenant(organizationId, () =>
      new ContactImportService().importCsv({
        organizationId,
        actorUserId: userId,
        fileName: 'national.csv',
        csvContent: 'name,phone\nRahul,9876543210\n',
      })
    )

    assert.equal(result.successCount, 0)
    assert.equal(result.errorCount, 1)
    assert.equal(result.rows[0]?.status, 'failed')
    assert.equal(result.rows[0]?.errorMessage, 'National phone number requires a default country')
    assert.deepEqual(result.rows[0]?.rawData, { name: 'Rahul', phone: '9876543210' })
  })

  test('continues after invalid rows and skips duplicate formats', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const result = await runWithTenant(organizationId, () =>
      new ContactImportService().importCsv({
        organizationId,
        actorUserId: userId,
        fileName: 'partial.csv',
        defaultCountryCode: 'IN',
        csvContent: [
          'name,phone',
          'Rahul,9876543210',
          'Bad,',
          'AlsoBad,not-a-phone',
          'Broken,+12',
          'Dup,+919876543210',
          'John,+14155552671',
        ].join('\n'),
      })
    )

    assert.equal(result.status, 'completed')
    assert.equal(result.totalRows, 6)
    assert.equal(result.processedRows, 6)
    assert.equal(result.successCount, 2)
    assert.equal(result.errorCount, 3)
    assert.equal(result.rows[1]?.errorMessage, 'Missing phone value')
    assert.equal(result.rows[2]?.errorMessage, 'Invalid phone number')
    assert.equal(result.rows[3]?.errorMessage, 'Invalid phone number')
    assert.equal(result.rows[4]?.status, 'skipped')
    assert.equal(result.rows[4]?.action, 'skipped')
    assert.isNotNull(result.rows[0]?.contactId)
    assert.isNotNull(result.rows[5]?.contactId)

    const importRow = await runWithTenant(organizationId, () =>
      db.from('contact_imports').where('id', result.id).first()
    )
    assert.equal(importRow.status, 'completed')
    assert.equal(importRow.successCount, 2)
    assert.equal(importRow.errorCount, 3)
    assert.equal(importRow.defaultCountryCode, 'IN')

    const dbRows = await runWithTenant(organizationId, () =>
      db.from('contact_import_rows').where('importId', result.id).orderBy('rowNumber')
    )
    assert.lengthOf(dbRows, 6)
    assert.equal(dbRows[0].contactId, result.rows[0]?.contactId)
    const brokenRaw =
      typeof dbRows[3].rawData === 'string' ? JSON.parse(dbRows[3].rawData) : dbRows[3].rawData
    assert.equal(brokenRaw.name, 'Broken')
    assert.equal(brokenRaw.phone, '+12')
  })

  test('rejects invalid default country, empty CSV, and missing phone column', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const service = new ContactImportService()

    try {
      await runWithTenant(organizationId, () =>
        service.importCsv({
          organizationId,
          actorUserId: userId,
          fileName: 'zz.csv',
          defaultCountryCode: 'ZZ',
          csvContent: 'name,phone\nRahul,9876543210\n',
        })
      )
      assert.fail('expected invalid country')
    } catch (error) {
      assert.instanceOf(error, ContactException)
      assert.equal((error as ContactException).code, 'E_CONTACT_IMPORT_INVALID_COUNTRY')
    }

    try {
      await runWithTenant(organizationId, () =>
        service.importCsv({
          organizationId,
          actorUserId: userId,
          fileName: 'empty.csv',
          csvContent: 'name,phone\n',
        })
      )
      assert.fail('expected empty csv')
    } catch (error) {
      assert.instanceOf(error, ContactException)
      assert.equal((error as ContactException).code, 'E_CONTACT_IMPORT_EMPTY')
    }

    try {
      await runWithTenant(organizationId, () =>
        service.importCsv({
          organizationId,
          actorUserId: userId,
          fileName: 'nophone.csv',
          csvContent: 'name,email\nAda,ada@example.com\n',
        })
      )
      assert.fail('expected missing phone column')
    } catch (error) {
      assert.instanceOf(error, ContactException)
      assert.equal((error as ContactException).code, 'E_CONTACT_IMPORT_MISSING_PHONE_COLUMN')
    }
  })
})
