import { test } from '@japa/runner'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import { ensureDemoFixtures } from '#tests/helpers/ensure_demo_fixtures'
import { OnboardingService } from '#services/onboarding_service'

test.group('OnboardingService.getState platform admin', (group) => {
  group.setup(async () => {
    await ensureDemoFixtures()
  })

  test('superadmin with no orgs is flagged isPlatformAdmin', async ({ assert }) => {
    const state = await new OnboardingService().getState({
      userId: FIXTURE_IDS.users.superadmin,
    })

    assert.isTrue(state.isPlatformAdmin)
    assert.equal(state.nextStep, 'create_organization')
    assert.lengthOf(state.organizations, 0)
  })

  test('tenant agent is not isPlatformAdmin', async ({ assert }) => {
    const state = await new OnboardingService().getState({
      userId: FIXTURE_IDS.users.northstarAgent,
      activeOrganizationId: FIXTURE_IDS.orgs.northstar,
    })

    assert.isFalse(state.isPlatformAdmin)
    assert.notEqual(state.nextStep, 'create_organization')
  })
})
