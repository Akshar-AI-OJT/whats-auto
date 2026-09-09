import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import { PlatformSettingsService } from '#services/platform_settings_service'

test.group('PlatformSettingsService', () => {
  test('returns non-secret env-derived sections without inventing MFA/maintenance fields', async ({
    assert,
  }: {
    assert: Assert
  }) => {
    const snapshot = new PlatformSettingsService().getSnapshot()

    assert.properties(snapshot, [
      'branding',
      'authentication',
      'smtp',
      'oauth',
      'maintenanceMode',
      'configuration',
    ])

    assert.isArray(snapshot.maintenanceMode)
    assert.lengthOf(snapshot.maintenanceMode, 0)
    assert.lengthOf(snapshot.configuration, 0)

    const authKeys = snapshot.authentication.map((i) => i.key)
    assert.notInclude(authKeys, 'mfaEnforcement')
    assert.notInclude(authKeys, 'passwordPolicy')

    const smtpKeys = snapshot.smtp.map((i) => i.key)
    assert.notInclude(smtpKeys, 'dailyLimit')

    const oauthKeys = snapshot.oauth.map((i) => i.key)
    assert.include(oauthKeys, 'googleSignIn')
    assert.notInclude(oauthKeys, 'microsoftSignIn')

    for (const section of Object.values(snapshot)) {
      for (const row of section) {
        assert.isString(row.id)
        assert.isString(row.key)
        assert.isString(row.value)
        assert.notMatch(row.value, /sk-|secret|password/i)
      }
    }
  })
})
