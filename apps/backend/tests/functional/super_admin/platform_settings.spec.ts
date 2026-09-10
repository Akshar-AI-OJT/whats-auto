import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { auth } from '#lib/auth'
import env from '#start/env'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { PLATFORM_SETTINGS_SINGLETON_KEY } from '#types/platform_settings'

const SETTINGS_PATH = '/api/v1/super-admin/platform-settings'
const MOCK_PLATFORM_NAME = 'Whats-Auto'

const DEFAULTS = {
  platformName: 'WhatsAuto',
  primaryDomain: 'localhost',
  supportEmail: 'support@example.com',
  sessionTimeoutHours: 12,
  mfaEnforcement: 'super_admin_and_platform_admin',
  passwordMinLength: 12,
  smtpDailyLimit: 50000,
  googleSignInEnabled: true,
  microsoftSignInEnabled: false,
  oauthRedirectUrl: 'http://localhost:3000/auth/callback',
  maintenanceEnabled: false,
  allowlistedIps: JSON.stringify([]),
  nextMaintenanceWindow: null as Date | null,
  defaultTimezone: 'Asia/Kolkata',
  dataRetentionDays: 180,
  apiRateLimitPerMinute: 1000,
  billingBrandName: '',
  billingLegalName: '',
  billingTagline: '',
  billingAddress: '',
  billingGstin: '',
  billingEmail: '',
  billingPhone: '',
  billingWebsite: '',
  updatedByUserId: null as string | null,
}

async function restoreDefaults() {
  await db
    .from('platform_settings')
    .where('singletonKey', PLATFORM_SETTINGS_SINGLETON_KEY)
    .update(DEFAULTS)
}

async function mintToken(email: string, activeOrgId?: string): Promise<string> {
  const result = (await auth.api.signInEmail({
    body: { email, password: DEMO_PASSWORD },
  })) as { token?: string; user?: { id: string; name: string; email: string } }

  if (!result.token || !result.user?.id) {
    throw new Error(`Failed to sign in ${email}`)
  }

  const sessionRow = await db.from('sessions').where('token', result.token).select('id').first()
  if (!sessionRow?.id) {
    throw new Error(`No session row after sign-in for ${email}`)
  }

  if (activeOrgId) {
    await db
      .from('sessions')
      .where('id', sessionRow.id)
      .update({ activeOrganizationId: activeOrgId })
  }

  const payload = await new AccessTokenClaimsService().build({
    user: {
      id: result.user.id,
      email,
      name: result.user.name ?? email,
    },
    session: { id: sessionRow.id as string, activeOrganizationId: activeOrgId ?? null },
  })

  const signed = await auth.api.signJWT({
    body: { payload: payload as Record<string, any> },
  })
  const token = (signed as { token?: string } | null)?.token
  if (!token) {
    throw new Error(`signJWT returned no token for ${email}`)
  }
  return token
}

function errorBody(response: { body: () => unknown }): { code?: string; error?: string } {
  return response.body() as { code?: string; error?: string }
}

function settingsData(response: { body: () => { data?: Record<string, unknown> } }) {
  return response.body().data as Record<string, unknown>
}

function secretText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.length > 0 ? value : null
  if (
    typeof value === 'object' &&
    'release' in value &&
    typeof (value as { release: () => string }).release === 'function'
  ) {
    const raw = (value as { release: () => string }).release()
    return raw?.length ? raw : null
  }
  return null
}

test.group('BUG-014 Super Admin platform settings', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.each.setup(async () => {
    await restoreDefaults()
  })

  test('rejects unauthenticated GET', async ({ client }) => {
    const response = await client.get(SETTINGS_PATH)
    response.assertStatus(401)
  })

  test('rejects a tenant JWT on GET', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarOwner, FIXTURE_IDS.orgs.northstar)
    const response = await client.get(SETTINGS_PATH).header('Authorization', `Bearer ${token}`)

    response.assertStatus(403)
    assert.equal(errorBody(response).code, 'PLATFORM_ACCESS_DENIED')
  })

  test('rejects a tenant JWT on PATCH', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.northstarOwner, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .patch(SETTINGS_PATH)
      .header('Authorization', `Bearer ${token}`)
      .json({ platformName: 'ShouldNotPersist' })

    response.assertStatus(403)
    assert.equal(errorBody(response).code, 'PLATFORM_ACCESS_DENIED')

    const row = await db
      .from('platform_settings')
      .where('singletonKey', PLATFORM_SETTINGS_SINGLETON_KEY)
      .first()
    assert.equal(row?.platformName, DEFAULTS.platformName)
  })

  test('superadmin GET returns persisted settings, not mock-data', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client.get(SETTINGS_PATH).header('Authorization', `Bearer ${token}`)
    response.assertStatus(200)

    const data = settingsData(response)
    assert.equal(data.platformName, DEFAULTS.platformName)
    assert.notEqual(data.platformName, MOCK_PLATFORM_NAME)
    assert.equal(data.sessionTimeoutHours, 12)
    assert.equal(data.billingLegalName, '')
    assert.equal(data.billingGstin, '')
    assert.notInclude(JSON.stringify(data), '09AABCW1234D1Z5')
    assert.equal(data.mfaEnforcement, 'super_admin_and_platform_admin')
    assert.equal(data.smtpMailer, env.get('MAIL_MAILER'))
    assert.equal(data.smtpFromAddress, env.get('MAIL_FROM_ADDRESS'))
    assert.isUndefined(data.singletonKey)

    const row = await db
      .from('platform_settings')
      .where('singletonKey', PLATFORM_SETTINGS_SINGLETON_KEY)
      .first()
    assert.exists(row)
    assert.equal(row?.platformName, data.platformName)
  })

  test('superadmin PATCH persists to PostgreSQL and GET returns the new value', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const nextName = 'BUG014-Live'

    const patched = await client
      .patch(SETTINGS_PATH)
      .header('Authorization', `Bearer ${token}`)
      .json({
        platformName: nextName,
        sessionTimeoutHours: 8,
        allowlistedIps: ['127.0.0.1', '10.0.0.8'],
      })
    patched.assertStatus(200)
    assert.equal(settingsData(patched).platformName, nextName)
    assert.equal(settingsData(patched).sessionTimeoutHours, 8)
    assert.deepEqual(settingsData(patched).allowlistedIps, ['127.0.0.1', '10.0.0.8'])

    const row = await db
      .from('platform_settings')
      .where('singletonKey', PLATFORM_SETTINGS_SINGLETON_KEY)
      .first()
    assert.equal(row?.platformName, nextName)
    assert.equal(Number(row?.sessionTimeoutHours), 8)

    const again = await client.get(SETTINGS_PATH).header('Authorization', `Bearer ${token}`)
    again.assertStatus(200)
    assert.equal(settingsData(again).platformName, nextName)
    assert.equal(settingsData(again).sessionTimeoutHours, 8)

    const audit = await db
      .from('authorization_audits')
      .where('eventType', 'platform_settings.updated')
      .orderBy('createdAt', 'desc')
      .first()
    assert.exists(audit)
    assert.equal(audit?.targetType, 'platform_settings')
    assert.isNull(audit?.organizationId)
  })

  test('rejects invalid setting values with 422', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)

    const email = await client
      .patch(SETTINGS_PATH)
      .header('Authorization', `Bearer ${token}`)
      .json({ supportEmail: 'not-an-email' })
    email.assertStatus(422)

    const timeout = await client
      .patch(SETTINGS_PATH)
      .header('Authorization', `Bearer ${token}`)
      .json({ sessionTimeoutHours: 0 })
    timeout.assertStatus(422)

    const mfa = await client
      .patch(SETTINGS_PATH)
      .header('Authorization', `Bearer ${token}`)
      .json({ mfaEnforcement: 'sometimes' })
    mfa.assertStatus(422)

    const row = await db
      .from('platform_settings')
      .where('singletonKey', PLATFORM_SETTINGS_SINGLETON_KEY)
      .first()
    assert.equal(row?.platformName, DEFAULTS.platformName)
    assert.equal(Number(row?.sessionTimeoutHours), DEFAULTS.sessionTimeoutHours)
  })

  test('GET does not expose secrets or API keys', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client.get(SETTINGS_PATH).header('Authorization', `Bearer ${token}`)
    response.assertStatus(200)

    const payload = JSON.stringify(response.body())
    const data = settingsData(response)

    assert.notProperty(data, 'smtpPassword')
    assert.notProperty(data, 'brevoApiKey')
    assert.notProperty(data, 'googleClientId')
    assert.notProperty(data, 'googleClientSecret')
    assert.notProperty(data, 'microsoftClientSecret')
    assert.notProperty(data, 'APP_KEY')
    assert.notProperty(data, 'SMTP_PASSWORD')
    assert.notProperty(data, 'BREVO_API')
    assert.notProperty(data, 'GOOGLE_CLIENT_SECRET')
    assert.isBoolean(data.smtpPasswordConfigured)
    assert.isBoolean(data.brevoApiKeyConfigured)
    assert.isBoolean(data.googleSignInConfigured)

    const googleClientId = env.get('GOOGLE_CLIENT_ID')
    if (googleClientId.length >= 8) {
      assert.notInclude(payload, googleClientId)
    }

    for (const secret of [
      secretText(env.get('SMTP_PASSWORD')),
      secretText(env.get('BREVO_API')),
      secretText(env.get('GOOGLE_CLIENT_SECRET')),
      secretText(env.get('APP_KEY')),
    ]) {
      if (secret && secret.length >= 8) {
        assert.notInclude(payload, secret)
      }
    }
  })

  test('unknown secret fields on PATCH are ignored and not returned', async ({
    client,
    assert,
  }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .patch(SETTINGS_PATH)
      .header('Authorization', `Bearer ${token}`)
      .json({
        platformName: 'BUG014-NoSecrets',
        smtpPassword: 'super-secret-smtp',
        brevoApiKey: 'super-secret-brevo',
        googleClientSecret: 'super-secret-google',
      })
    response.assertStatus(200)

    const payload = JSON.stringify(response.body())
    assert.notInclude(payload, 'super-secret-smtp')
    assert.notInclude(payload, 'super-secret-brevo')
    assert.notInclude(payload, 'super-secret-google')
    assert.notProperty(settingsData(response), 'smtpPassword')
  })
})
