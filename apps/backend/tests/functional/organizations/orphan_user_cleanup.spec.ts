import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import { ensureDemoFixtures } from '#tests/helpers/ensure_demo_fixtures'
import { OnboardingCleanupService } from '#services/onboarding_cleanup_service'

test.group('Orphan user cleanup', (group) => {
  group.setup(async () => {
    await ensureDemoFixtures()
  })

  test('purges user with no live membership after 30 days and cascades accounts', async ({
    assert,
  }) => {
    const userId = randomUUID()
    const accountId = randomUUID()
    const memberId = randomUUID()
    const email = `orphan-${userId.slice(0, 8)}@example.com`
    const removedAt = DateTime.utc().minus({ days: 40 }).toSQL()
    const agentRoleId = await db
      .from('roles')
      .whereNull('organizationId')
      .where('name', 'agent')
      .select('id')
      .firstOrFail()

    await db.table('users').insert({
      id: userId,
      name: 'Orphan User',
      firstname: 'Orphan',
      lastname: 'User',
      email,
      emailVerified: true,
      isActive: true,
      isDeleted: false,
      createdAt: DateTime.utc().minus({ days: 60 }).toSQL(),
    })

    await db.table('accounts').insert({
      id: accountId,
      userId,
      accountId: userId,
      providerId: 'credential',
      password: await hash.make('orphan-test-password'),
    })

    await db.table('organization_members').insert({
      id: memberId,
      organizationId: FIXTURE_IDS.orgs.northstar,
      userId,
      roleId: agentRoleId.id,
      permissionVersion: 1,
      isDeleted: true,
      deletedAt: removedAt,
    })

    try {
      const result = await new OnboardingCleanupService().run({
        now: new Date(),
        orphanUserMaxAgeDays: 30,
        // Avoid unrelated unpaid-org purges affecting assertions.
        pendingOrgMaxAgeDays: 3650,
      })

      assert.isAtLeast(result.purgedOrphanUsers, 1)

      const userAfter = await db.from('users').where('id', userId).first()
      assert.isNull(userAfter)

      const accountAfter = await db.from('accounts').where('id', accountId).first()
      assert.isNull(accountAfter)

      const memberAfter = await db.from('organization_members').where('id', memberId).first()
      assert.isNull(memberAfter)
    } finally {
      await db.from('organization_members').where('id', memberId).delete()
      await db.from('accounts').where('id', accountId).delete()
      await db.from('users').where('id', userId).delete()
    }
  })

  test('keeps recently removed member identity (under 30 days)', async ({ assert }) => {
    const userId = randomUUID()
    const memberId = randomUUID()
    const email = `recent-orphan-${userId.slice(0, 8)}@example.com`
    const removedAt = DateTime.utc().minus({ days: 5 }).toSQL()
    const agentRoleId = await db
      .from('roles')
      .whereNull('organizationId')
      .where('name', 'agent')
      .select('id')
      .firstOrFail()

    await db.table('users').insert({
      id: userId,
      name: 'Recent Orphan',
      firstname: 'Recent',
      lastname: 'Orphan',
      email,
      emailVerified: true,
      isActive: true,
      isDeleted: false,
      createdAt: DateTime.utc().minus({ days: 20 }).toSQL(),
    })

    await db.table('organization_members').insert({
      id: memberId,
      organizationId: FIXTURE_IDS.orgs.northstar,
      userId,
      roleId: agentRoleId.id,
      permissionVersion: 1,
      isDeleted: true,
      deletedAt: removedAt,
    })

    try {
      await new OnboardingCleanupService().run({
        now: new Date(),
        orphanUserMaxAgeDays: 30,
        pendingOrgMaxAgeDays: 3650,
      })

      const userAfter = await db.from('users').where('id', userId).first()
      assert.exists(userAfter)
    } finally {
      await db.from('organization_members').where('id', memberId).delete()
      await db.from('users').where('id', userId).delete()
    }
  })

  test('keeps user who still has a live membership', async ({ assert }) => {
    const userId = FIXTURE_IDS.users.northstarAgent
    const before = await db.from('users').where('id', userId).first()
    assert.exists(before)

    await new OnboardingCleanupService().run({
      now: new Date(),
      orphanUserMaxAgeDays: 30,
      pendingOrgMaxAgeDays: 3650,
    })

    const after = await db.from('users').where('id', userId).first()
    assert.exists(after)
  })
})
