import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import { ensureDemoFixtures } from '#tests/helpers/ensure_demo_fixtures'
import { OnboardingService } from '#services/onboarding_service'
import { OrganizationService } from '#services/organization_service'

/**
 * Repro: after soft-removing a member, login/onboarding must treat them as
 * having zero organizations (not still list the org and send them to dashboard).
 */
test.group('Removed member login gate', (group) => {
  group.setup(async () => {
    await ensureDemoFixtures()
  })

  test('soft-deleted membership is omitted from listMyOrganizations and onboarding state', async ({
    assert,
  }) => {
    const userId = FIXTURE_IDS.users.northstarAgent
    const memberId = FIXTURE_IDS.members.northstarAgent
    const orgId = FIXTURE_IDS.orgs.northstar

    await db.from('organization_members').where('id', memberId).update({
      isDeleted: true,
      deletedAt: DateTime.utc().toSQL(),
    })

    try {
      const orgs = await new OrganizationService().listMyOrganizations(userId)
      assert.lengthOf(
        orgs,
        0,
        `listMyOrganizations still returns soft-deleted membership for ${DEMO_USERS.northstarAgent}`
      )

      const state = await new OnboardingService().getState({ userId })
      assert.lengthOf(state.organizations, 0)
      assert.equal(state.nextStep, 'create_organization')
      assert.isNull(state.activeOrganizationId)

      await assert.rejects(async () => {
        await new OrganizationService().setActiveOrganization({
          userId,
          sessionId: '00000000-0000-4000-8000-000000000001',
          organizationId: orgId,
        })
      }, 'You are not a member of this organization')
    } finally {
      await db.from('organization_members').where('id', memberId).update({
        isDeleted: false,
        deletedAt: null,
      })
    }
  })
})
