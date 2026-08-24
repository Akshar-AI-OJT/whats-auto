import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { extractPostgresError } from '#lib/pg_unique_violation'

async function assertCheckViolation(fn: () => Promise<unknown>) {
  try {
    await fn()
    throw new Error('expected PostgreSQL check_violation (23514)')
  } catch (error) {
    if (error instanceof Error && error.message === 'expected PostgreSQL check_violation (23514)') {
      throw error
    }
    const pg = extractPostgresError(error)
    if (pg?.code !== '23514') {
      throw error
    }
  }
}

async function insertOrg(overrides: Record<string, unknown> = {}) {
  const id = randomUUID()
  const slug = `verif-schema-${id.slice(0, 8)}`
  await db.table('organizations').insert({
    id,
    name: `Verify ${slug}`,
    slug,
    email: `${slug}@example.com`,
    country: 'US',
    timezone: 'UTC',
    currency: 'USD',
    status: true,
    ...overrides,
  })
  return id
}

test.group('organization verification schema', (group) => {
  const orgIds: string[] = []
  const userIds: string[] = []

  group.each.teardown(async () => {
    while (orgIds.length > 0) {
      const id = orgIds.pop()
      if (id) await db.from('organizations').where('id', id).delete()
    }
    while (userIds.length > 0) {
      const id = userIds.pop()
      if (id) await db.from('users').where('id', id).delete()
    }
  })

  test('defaults new organizations to unverified', async ({ assert }) => {
    const id = await insertOrg()
    orgIds.push(id)

    const row = await db.from('organizations').where('id', id).firstOrFail()
    assert.equal(row.verificationStatus, 'unverified')
    assert.isNull(row.verificationRejectionReason)
    assert.isNull(row.verifiedAt)
    assert.isNull(row.verifiedByUserId)
  })

  test('rejects an invalid verificationStatus', async () => {
    await assertCheckViolation(() => insertOrg({ verificationStatus: 'nonsense' }))
  })

  test('requires verifiedAt when status is verified', async () => {
    await assertCheckViolation(() =>
      insertOrg({ verificationStatus: 'verified', verifiedAt: null })
    )

    const id = await insertOrg({
      verificationStatus: 'verified',
      verifiedAt: new Date(),
    })
    orgIds.push(id)
  })

  test('requires rejection reason when status is rejected', async () => {
    await assertCheckViolation(() =>
      insertOrg({ verificationStatus: 'rejected', verificationRejectionReason: null })
    )

    const id = await insertOrg({
      verificationStatus: 'rejected',
      verificationRejectionReason: 'Documents do not match the registered name',
    })
    orgIds.push(id)
  })

  test('defaults new users to mustChangePassword false', async ({ assert }) => {
    const id = randomUUID()
    userIds.push(id)
    await db.table('users').insert({
      id,
      name: 'Verify User',
      firstname: 'Verify',
      lastname: 'User',
      email: `verify-user-${id.slice(0, 8)}@example.com`,
      emailVerified: false,
      isActive: true,
      isDeleted: false,
    })

    const row = await db.from('users').where('id', id).firstOrFail()
    assert.equal(row.mustChangePassword, false)
  })
})
