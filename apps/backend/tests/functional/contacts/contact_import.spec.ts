import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import db from '@adonisjs/lucid/services/db'
import ContactException from '#exceptions/contact_exception'
import { ContactImportService } from '#services/contact_import_service'
import { ContactService } from '#services/contact_service'
import { ObjectStorageService } from '#services/object_storage_service'
import NullJobQueueDriver from '#services/job_queue/drivers/null_driver'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { createContactImportHandler } from '#services/job_queue/handlers/contact_import_handler'
import { runWithTenant } from '#services/tenant_context'
import { buildContactImportStorageKey } from '#lib/organization_storage_path'

const csvImportPlanIds: string[] = []

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
      status: 'active',
    })
    .returning(['id'])
  const organizationId = row.id as string
  const planId = randomUUID()
  await db.table('plans').insert({
    id: planId,
    code: `csv_${organizationId.slice(0, 8)}`,
    name: 'CSV Import Plan',
    price: 0,
    currency: 'INR',
    billingInterval: 'month',
    billingIntervalCount: 1,
    trialDays: 0,
    gateway: null,
    gatewayPlanId: null,
    limits: {},
    isActive: true,
    sortOrder: 1,
    metadata: {
      features: [{ key: 'contactCsvImportExport', enabled: true }],
    },
  })
  await runWithTenant(organizationId, async () => {
    await db.table('organization_subscriptions').insert({
      id: randomUUID(),
      organizationId,
      planId,
      status: 'active',
      currentPeriodStart: new Date(Date.now() - 86400000),
      currentPeriodEnd: new Date(Date.now() + 20 * 86400000),
      cancelAtPeriodEnd: false,
      metadata: {},
    })
  })
  csvImportPlanIds.push(planId)
  return organizationId
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

async function enqueueAndProcess(params: {
  organizationId: string
  actorUserId: string
  fileName: string
  csvContent: string
  columnMapping?: { phone?: string; name?: string; email?: string; company?: string }
  defaultCountryCode?: string
}) {
  const queued = await new ContactImportService().importCsv(params)
  return new ContactImportService().processImport({
    organizationId: params.organizationId,
    importId: queued.id,
  })
}

async function seedPlanWithContactLimit(organizationId: string, contacts: number) {
  const planId = randomUUID()
  await db.table('plans').insert({
    id: planId,
    code: `contacts_${organizationId.slice(0, 8)}`,
    name: 'Contact Limit Plan',
    price: 0,
    currency: 'INR',
    billingInterval: 'month',
    billingIntervalCount: 1,
    trialDays: 0,
    gateway: null,
    gatewayPlanId: null,
    limits: { maxContacts: contacts },
    isActive: true,
    sortOrder: 1,
    metadata: {
      features: [{ key: 'contactCsvImportExport', enabled: true }],
    },
  })

  await runWithTenant(organizationId, async () => {
    await db.table('organization_subscriptions').insert({
      id: randomUUID(),
      organizationId,
      planId,
      status: 'active',
      currentPeriodStart: new Date(Date.now() - 86400000),
      currentPeriodEnd: new Date(Date.now() + 20 * 86400000),
      cancelAtPeriodEnd: false,
      metadata: {},
    })
  })

  return planId
}

function nationalCsv(count: number, start = 0) {
  const lines = ['name,phone']
  for (let index = 0; index < count; index++) {
    const n = start + index
    lines.push(`Person${n},${8700000000 + n}`)
  }
  return lines.join('\n')
}

test.group('ContactImportService', (group) => {
  const orgIds: string[] = []
  const userIds: string[] = []
  const planIds: string[] = []

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
        await db.from('contact_import_rows').where('organizationId', organizationId).delete()
        await db.from('contact_imports').where('organizationId', organizationId).delete()
        await db.from('contacts').where('organizationId', organizationId).delete()
        await db.from('organization_subscriptions').where('organizationId', organizationId).delete()
      })
      await db.from('organizations').where('id', organizationId).delete()
    }
    const allPlanIds = [...planIds, ...csvImportPlanIds]
    if (allPlanIds.length > 0) {
      await db.from('plans').whereIn('id', allPlanIds).delete()
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
      enqueueAndProcess({
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
      enqueueAndProcess({
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
      enqueueAndProcess({
        organizationId,
        actorUserId: userId,
        fileName: 'us.csv',
        defaultCountryCode: 'US',
        csvContent: 'name,phone\nAlex,4155552671\n',
      })
    )
    assert.equal(us.rows[0]?.action, 'inserted')

    const gb = await runWithTenant(organizationId, () =>
      enqueueAndProcess({
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
      enqueueAndProcess({
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
      enqueueAndProcess({
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
      enqueueAndProcess({
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
      enqueueAndProcess({
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

  test('skips an existing contact without overwriting it', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const existing = await runWithTenant(organizationId, () =>
      new ContactService().createContact({
        organizationId,
        actorUserId: userId,
        phoneNumber: '+919876543210',
        name: 'Original Name',
        email: 'original@example.com',
        company: 'Original Co',
      })
    )

    const result = await runWithTenant(organizationId, () =>
      enqueueAndProcess({
        organizationId,
        actorUserId: userId,
        fileName: 'dup.csv',
        defaultCountryCode: 'IN',
        csvContent:
          'name,phone,email,company\nUpdated Name,9876543210,updated@example.com,Updated Co\n',
      })
    )

    assert.equal(result.status, 'completed')
    assert.equal(result.successCount, 0)
    assert.equal(result.errorCount, 0)
    assert.equal(result.rows[0]?.status, 'skipped')
    assert.equal(result.rows[0]?.action, 'skipped')

    const after = await runWithTenant(organizationId, () =>
      db.from('contacts').where('id', existing.id).first()
    )
    assert.equal(after.name, 'Original Name')
    assert.equal(after.email, 'original@example.com')
    assert.equal(after.company, 'Original Co')
    assert.equal(after.phone, '+919876543210')
    assert.equal(after.phoneNormalized, '919876543210')

    const listed = await runWithTenant(organizationId, () =>
      new ContactService().listContacts(organizationId)
    )
    assert.lengthOf(listed, 1)
    assert.equal(listed[0].id, existing.id)
  })

  test('lets two organizations import the same normalized number', async ({ assert }) => {
    const orgA = await createOrg()
    const orgB = await createOrg()
    orgIds.push(orgA, orgB)
    const userId = await seedUser()
    userIds.push(userId)

    const resultA = await runWithTenant(orgA, () =>
      enqueueAndProcess({
        organizationId: orgA,
        actorUserId: userId,
        fileName: 'org-a.csv',
        defaultCountryCode: 'IN',
        csvContent: 'name,phone\nRahul,9876543210\n',
      })
    )
    const resultB = await runWithTenant(orgB, () =>
      enqueueAndProcess({
        organizationId: orgB,
        actorUserId: userId,
        fileName: 'org-b.csv',
        csvContent: 'name,phone\nRahul,+919876543210\n',
      })
    )

    assert.equal(resultA.rows[0]?.action, 'inserted')
    assert.equal(resultB.rows[0]?.action, 'inserted')
    assert.notEqual(resultA.rows[0]?.contactId, resultB.rows[0]?.contactId)

    const contactA = await runWithTenant(orgA, () =>
      db
        .from('contacts')
        .where('id', resultA.rows[0]?.contactId as string)
        .first()
    )
    const contactB = await runWithTenant(orgB, () =>
      db
        .from('contacts')
        .where('id', resultB.rows[0]?.contactId as string)
        .first()
    )
    assert.equal(contactA.organizationId, orgA)
    assert.equal(contactB.organizationId, orgB)
    assert.equal(contactA.phoneNormalized, '919876543210')
    assert.equal(contactB.phoneNormalized, '919876543210')
  })

  test('does not import unmapped name, email, or company columns', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const result = await runWithTenant(organizationId, () =>
      enqueueAndProcess({
        organizationId,
        actorUserId: userId,
        fileName: 'unmap.csv',
        columnMapping: { phone: 'phone' },
        csvContent: 'name,phone,email,company\nRahul,+919876543210,rahul@example.com,Acme\n',
      })
    )

    assert.equal(result.rows[0]?.action, 'inserted')
    const contact = await runWithTenant(organizationId, () =>
      db
        .from('contacts')
        .where('id', result.rows[0]?.contactId as string)
        .first()
    )
    assert.equal(contact.phoneNormalized, '919876543210')
    assert.isNull(contact.name)
    assert.isNull(contact.email)
    assert.isNull(contact.company)
  })

  test('fails invalid email and oversize fields as row errors without aborting the batch', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    const tooLong = 'A'.repeat(256)

    const result = await runWithTenant(organizationId, () =>
      enqueueAndProcess({
        organizationId,
        actorUserId: userId,
        fileName: 'profile.csv',
        columnMapping: {
          phone: 'phone',
          name: 'name',
          email: 'email',
          company: 'company',
        },
        csvContent: [
          'name,phone,email,company',
          'Good,+14155552671,good@example.com,Acme',
          'BadEmail,+919876543210,not-an-email,Acme',
          `${tooLong},+447911123456,ok@example.com,Acme`,
        ].join('\n'),
      })
    )

    assert.equal(result.status, 'completed')
    assert.equal(result.successCount, 1)
    assert.equal(result.errorCount, 2)
    assert.equal(result.rows[0]?.action, 'inserted')
    assert.equal(result.rows[1]?.status, 'failed')
    assert.equal(result.rows[1]?.errorMessage, 'Invalid email address')
    assert.equal(result.rows[2]?.status, 'failed')
    assert.equal(result.rows[2]?.errorMessage, 'Name is too long')

    const contacts = await runWithTenant(organizationId, () =>
      db
        .from('contacts')
        .where('organizationId', organizationId)
        .whereNull('deletedAt')
        .select('email')
    )
    assert.lengthOf(contacts, 1)
    assert.equal(contacts[0]?.email, 'good@example.com')
  })

  test('enqueues a background job and does not insert contacts in the request', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const manager = await app.container.make(JobQueueManager)
    const driver = (await manager.ensureStarted()) as NullJobQueueDriver
    driver.clearEnqueued()

    const queued = await runWithTenant(organizationId, () =>
      new ContactImportService().importCsv({
        organizationId,
        actorUserId: userId,
        fileName: 'queued.csv',
        defaultCountryCode: 'IN',
        csvContent: nationalCsv(20),
      })
    )

    assert.equal(queued.status, 'pending')
    assert.equal(queued.successCount, 0)
    assert.equal(queued.processedRows, 0)
    assert.equal(queued.totalRows, 20)
    assert.lengthOf(queued.rows, 0)
    assert.equal(driver.enqueued[driver.enqueued.length - 1]?.name, JOB_NAMES.CONTACT_IMPORT)
    assert.equal(driver.enqueued[driver.enqueued.length - 1]?.data.importId, queued.id)
    assert.equal(driver.enqueued[driver.enqueued.length - 1]?.data.organizationId, organizationId)

    const stored = await runWithTenant(organizationId, () =>
      db.from('contact_imports').where('id', queued.id).select('filePath', 'csvContent').first()
    )
    const expectedPath = `organizations/${organizationId}/imports/contacts/queued.csv`
    assert.equal(stored.filePath, expectedPath)
    assert.isNull(stored.csvContent)
    assert.isTrue(await drive.use().exists(expectedPath))
    assert.equal(await drive.use().get(expectedPath), nationalCsv(20))

    const contacts = await runWithTenant(organizationId, () =>
      db.from('contacts').where('organizationId', organizationId).whereNull('deletedAt')
    )
    assert.lengthOf(contacts, 0)

    const handler = createContactImportHandler()
    await handler({
      id: 'job-contact-import',
      name: JOB_NAMES.CONTACT_IMPORT,
      data: { organizationId, importId: queued.id },
    })

    const processed = await runWithTenant(organizationId, () =>
      new ContactImportService().getImport({ organizationId, importId: queued.id })
    )
    assert.equal(processed.status, 'completed')
    assert.equal(processed.successCount, 20)
    const after = await runWithTenant(organizationId, () =>
      db.from('contacts').where('organizationId', organizationId).whereNull('deletedAt')
    )
    assert.lengthOf(after, 20)
  })

  test('stops importing when the plan contact limit is reached', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    planIds.push(await seedPlanWithContactLimit(organizationId, 5))

    await runWithTenant(organizationId, async () => {
      for (let index = 0; index < 3; index++) {
        await new ContactService().createContact({
          organizationId,
          actorUserId: userId,
          phoneNumber: `${8600000000 + index}`,
          countryCode: 'IN',
          name: `Existing${index}`,
        })
      }
    })

    const result = await runWithTenant(organizationId, () =>
      enqueueAndProcess({
        organizationId,
        actorUserId: userId,
        fileName: 'limit.csv',
        defaultCountryCode: 'IN',
        csvContent: nationalCsv(8),
      })
    )

    assert.equal(result.status, 'stopped_due_to_limit')
    assert.equal(result.successCount, 2)
    assert.isBelow(result.processedRows, 8)
    assert.isBelow(result.rows.length, 8)

    const contacts = await runWithTenant(organizationId, () =>
      db.from('contacts').where('organizationId', organizationId).whereNull('deletedAt')
    )
    assert.lengthOf(contacts, 5)
  })

  test('stops immediately when the plan contact limit is already full', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    planIds.push(await seedPlanWithContactLimit(organizationId, 5))

    await runWithTenant(organizationId, async () => {
      for (let index = 0; index < 5; index++) {
        await new ContactService().createContact({
          organizationId,
          actorUserId: userId,
          phoneNumber: `${8600000000 + index}`,
          countryCode: 'IN',
          name: `Existing${index}`,
        })
      }
    })

    const result = await runWithTenant(organizationId, () =>
      enqueueAndProcess({
        organizationId,
        actorUserId: userId,
        fileName: 'full.csv',
        defaultCountryCode: 'IN',
        csvContent: nationalCsv(8),
      })
    )

    assert.equal(result.status, 'stopped_due_to_limit')
    assert.equal(result.successCount, 0)
    const contacts = await runWithTenant(organizationId, () =>
      db.from('contacts').where('organizationId', organizationId).whereNull('deletedAt')
    )
    assert.lengthOf(contacts, 5)
  })

  test('completes normally when the CSV is within the plan contact limit', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)
    planIds.push(await seedPlanWithContactLimit(organizationId, 10))

    await runWithTenant(organizationId, async () => {
      for (let index = 0; index < 2; index++) {
        await new ContactService().createContact({
          organizationId,
          actorUserId: userId,
          phoneNumber: `${8600000000 + index}`,
          countryCode: 'IN',
          name: `Existing${index}`,
        })
      }
    })

    const result = await runWithTenant(organizationId, () =>
      enqueueAndProcess({
        organizationId,
        actorUserId: userId,
        fileName: 'under.csv',
        defaultCountryCode: 'IN',
        csvContent: nationalCsv(5),
      })
    )

    assert.equal(result.status, 'completed')
    assert.equal(result.successCount, 5)
    assert.equal(result.processedRows, 5)
    const contacts = await runWithTenant(organizationId, () =>
      db.from('contacts').where('organizationId', organizationId).whereNull('deletedAt')
    )
    assert.lengthOf(contacts, 7)
  })

  test('resumes after an unexpected worker failure without duplicating contacts', async ({
    assert,
  }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    class BoomContacts extends ContactService {
      calls = 0
      async createContact(params: Parameters<ContactService['createContact']>[0]) {
        this.calls += 1
        if (this.calls === 2) {
          throw new Error('worker boom')
        }
        return super.createContact(params)
      }
    }

    const queued = await runWithTenant(organizationId, () =>
      new ContactImportService().importCsv({
        organizationId,
        actorUserId: userId,
        fileName: 'retry.csv',
        defaultCountryCode: 'IN',
        csvContent: nationalCsv(3),
      })
    )

    try {
      await runWithTenant(organizationId, () =>
        new ContactImportService(new BoomContacts()).processImport({
          organizationId,
          importId: queued.id,
        })
      )
      assert.fail('expected worker boom')
    } catch (error) {
      assert.equal((error as Error).message, 'worker boom')
    }

    const failed = await runWithTenant(organizationId, () =>
      new ContactImportService().getImport({ organizationId, importId: queued.id })
    )
    assert.equal(failed.status, 'failed')
    assert.equal(failed.successCount, 1)

    const resumed = await runWithTenant(organizationId, () =>
      new ContactImportService().processImport({
        organizationId,
        importId: queued.id,
      })
    )
    assert.equal(resumed.status, 'completed')
    assert.equal(resumed.successCount, 3)
    const contacts = await runWithTenant(organizationId, () =>
      db.from('contacts').where('organizationId', organizationId).whereNull('deletedAt')
    )
    assert.lengthOf(contacts, 3)
  })

  test('stores the CSV under the organization imports/contacts path', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const queued = await runWithTenant(organizationId, () =>
      new ContactImportService().importCsv({
        organizationId,
        actorUserId: userId,
        fileName: 'customer_contacts.csv',
        csvContent: 'name,phone\nRahul,+919876543210\n',
      })
    )

    const stored = await runWithTenant(organizationId, () =>
      db.from('contact_imports').where('id', queued.id).select('filePath', 'fileName').first()
    )
    assert.equal(stored.fileName, 'customer_contacts.csv')
    assert.equal(
      stored.filePath,
      `organizations/${organizationId}/imports/contacts/customer_contacts.csv`
    )
    assert.equal(await drive.use().get(stored.filePath), 'name,phone\nRahul,+919876543210\n')
  })

  test('sanitizes traversal filenames into the contacts folder', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const queued = await runWithTenant(organizationId, () =>
      new ContactImportService().importCsv({
        organizationId,
        actorUserId: userId,
        fileName: '../../etc/passwd.csv',
        csvContent: 'name,phone\nRahul,+919876543210\n',
      })
    )

    const stored = await runWithTenant(organizationId, () =>
      db.from('contact_imports').where('id', queued.id).select('filePath', 'fileName').first()
    )
    assert.equal(stored.fileName, 'passwd.csv')
    assert.equal(stored.filePath, `organizations/${organizationId}/imports/contacts/passwd.csv`)
    assert.isFalse(stored.filePath.includes('..'))
  })

  test('does not overwrite an existing import file with the same name', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const first = await runWithTenant(organizationId, () =>
      new ContactImportService().importCsv({
        organizationId,
        actorUserId: userId,
        fileName: 'contacts.csv',
        csvContent: 'name,phone\nFirst,+919876543210\n',
      })
    )
    const second = await runWithTenant(organizationId, () =>
      new ContactImportService().importCsv({
        organizationId,
        actorUserId: userId,
        fileName: 'contacts.csv',
        csvContent: 'name,phone\nSecond,+14155552671\n',
      })
    )

    const rows = await runWithTenant(organizationId, () =>
      db.from('contact_imports').whereIn('id', [first.id, second.id]).select('id', 'filePath')
    )
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.filePath]))
    assert.equal(byId[first.id], `organizations/${organizationId}/imports/contacts/contacts.csv`)
    assert.equal(
      byId[second.id],
      `organizations/${organizationId}/imports/contacts/contacts-${second.id}.csv`
    )
    assert.equal(await drive.use().get(byId[first.id]), 'name,phone\nFirst,+919876543210\n')
    assert.equal(await drive.use().get(byId[second.id]), 'name,phone\nSecond,+14155552671\n')
  })

  test('does not let another organization read a contact import file', async ({ assert }) => {
    const orgA = await createOrg()
    const orgB = await createOrg()
    orgIds.push(orgA, orgB)
    const userId = await seedUser()
    userIds.push(userId)
    const storage = new ObjectStorageService()

    const queuedA = await runWithTenant(orgA, () =>
      new ContactImportService().importCsv({
        organizationId: orgA,
        actorUserId: userId,
        fileName: 'contacts.csv',
        csvContent: 'name,phone\nRahul,+919876543210\n',
      })
    )

    const pathA = buildContactImportStorageKey(orgA, 'contacts.csv')
    const stored = await runWithTenant(orgA, () =>
      db.from('contact_imports').where('id', queuedA.id).select('filePath').first()
    )
    assert.equal(stored.filePath, pathA)
    assert.equal(await storage.getContactImportCsv(orgA, pathA), 'name,phone\nRahul,+919876543210\n')

    try {
      await storage.getContactImportCsv(orgB, pathA)
      assert.fail('expected cross-organization file access to be rejected')
    } catch (error) {
      assert.match((error as Error).message, /outside the organization storage path/)
    }

    try {
      await runWithTenant(orgB, () =>
        new ContactImportService().getImport({ organizationId: orgB, importId: queuedA.id })
      )
      assert.fail('expected import record to be tenant-scoped')
    } catch (error) {
      assert.instanceOf(error, ContactException)
      assert.equal((error as ContactException).code, 'E_CONTACT_IMPORT_NOT_FOUND')
    }
  })

  test('worker refuses a filePath that belongs to another organization', async ({ assert }) => {
    const orgA = await createOrg()
    const orgB = await createOrg()
    orgIds.push(orgA, orgB)
    const userId = await seedUser()
    userIds.push(userId)

    const queuedA = await runWithTenant(orgA, () =>
      new ContactImportService().importCsv({
        organizationId: orgA,
        actorUserId: userId,
        fileName: 'contacts.csv',
        csvContent: 'name,phone\nRahul,+919876543210\n',
      })
    )
    const queuedB = await runWithTenant(orgB, () =>
      new ContactImportService().importCsv({
        organizationId: orgB,
        actorUserId: userId,
        fileName: 'other.csv',
        csvContent: 'name,phone\nSam,+14155552671\n',
      })
    )

    const pathA = (
      await runWithTenant(orgA, () =>
        db.from('contact_imports').where('id', queuedA.id).select('filePath').first()
      )
    ).filePath as string

    await runWithTenant(orgB, () =>
      db.from('contact_imports').where('id', queuedB.id).update({ filePath: pathA, csvContent: null })
    )

    try {
      await runWithTenant(orgB, () =>
        new ContactImportService().processImport({
          organizationId: orgB,
          importId: queuedB.id,
        })
      )
      assert.fail('expected tampered filePath to fail')
    } catch (error) {
      assert.match((error as Error).message, /outside the organization storage path/)
    }

    const contactsB = await runWithTenant(orgB, () =>
      db.from('contacts').where('organizationId', orgB).whereNull('deletedAt')
    )
    assert.lengthOf(contactsB, 0)
  })

  test('worker still processes a legacy import that only has csvContent', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)
    const userId = await seedUser()
    userIds.push(userId)

    const [legacy] = await runWithTenant(organizationId, () =>
      db
        .table('contact_imports')
        .insert({
          organizationId,
          createdByUserId: userId,
          fileName: 'legacy.csv',
          status: 'pending',
          columnMapping: {},
          csvContent: 'name,phone\nRahul,+919876543210\n',
          filePath: null,
          totalRows: 1,
          processedRows: 0,
          successCount: 0,
          errorCount: 0,
        })
        .returning(['id'])
    )

    const result = await runWithTenant(organizationId, () =>
      new ContactImportService().processImport({
        organizationId,
        importId: legacy.id as string,
      })
    )

    assert.equal(result.status, 'completed')
    assert.equal(result.successCount, 1)
  })
})
