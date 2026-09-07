import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { DEMO_USERS } from '#database/demo/credentials'
import DemoSeeder from '#database/seeders/demo_seeder'
import { OrganizationStatus } from '#enums/organization_status'
import WhatsappConfigException from '#exceptions/whatsapp_config_exception'
import { MetaGraphApiError, type MetaGraphClient } from '#lib/meta_whatsapp/graph_client'
import { WhatsappEmbeddedSignupService } from '#services/whatsapp_embedded_signup_service'
import { runWithTenant } from '#services/tenant_context'

function fakeGraph(overrides: Partial<MetaGraphClient> = {}): MetaGraphClient {
  return {
    exchangeEmbeddedSignupCode: async () => ({ accessToken: 'tok' }),
    subscribeAppToWaba: async () => {},
    registerPhoneNumber: async () => {},
    getPhoneNumber: async ({ phoneNumberId }) => ({ id: phoneNumberId }),
    getWaba: async ({ wabaId }) => ({ id: wabaId, ownerBusinessId: 'biz-1' }),
    getBusinessPortfolio: async ({ businessId }) => ({
      id: businessId,
      verificationStatus: 'verified',
    }),
    sendTextMessage: async () => ({ raw: {} }),
    sendTemplateMessage: async () => ({ raw: {} }),
    sendMediaMessage: async () => ({ raw: {} }),
    sendInteractiveMessage: async () => ({ raw: {} }),
    ...overrides,
  } as MetaGraphClient
}

async function createPendingOrg(userId: string) {
  const organizationId = randomUUID()
  const slug = `es-${organizationId.slice(0, 8)}`

  await db.table('organizations').insert({
    id: organizationId,
    name: `ES ${slug}`,
    slug,
    email: `${slug}@example.com`,
    phone: '+919876543210',
    country: 'IN',
    timezone: 'UTC',
    currency: 'INR',
    status: OrganizationStatus.PENDING_SETUP,
  })

  return { organizationId, userId }
}

test.group('WhatsappEmbeddedSignupService.complete (D70)', (group) => {
  const orgIds: string[] = []
  let ownerUserId = ''

  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
    const owner = await db
      .from('users')
      .where('email', DEMO_USERS.northstarOwner)
      .select('id')
      .firstOrFail()
    ownerUserId = owner.id as string
  })

  group.each.teardown(async () => {
    while (orgIds.length > 0) {
      const organizationId = orgIds.pop()
      if (!organizationId) continue
      await runWithTenant(organizationId, async () => {
        await db.from('whatsapp_configs').where('organizationId', organizationId).delete()
        await db.from('organizations').where('id', organizationId).delete()
      })
    }
  })

  test('verified portfolio promotes org to verified_setup and connects config', async ({
    assert,
  }) => {
    const { organizationId, userId } = await createPendingOrg(ownerUserId)
    orgIds.push(organizationId)
    const phoneNumberId = `pn_${organizationId.slice(0, 8)}`

    const dto = await runWithTenant(organizationId, async () =>
      new WhatsappEmbeddedSignupService(fakeGraph()).complete({
        organizationId,
        userId,
        input: {
          code: 'auth-code',
          wabaId: 'waba-1',
          phoneNumberId,
          businessId: 'biz-1',
        },
      })
    )

    assert.equal(dto.status, 'connected')
    assert.equal(dto.businessId, 'biz-1')
    assert.equal(dto.metaVerificationStatus, 'verified')

    const org = await db
      .from('organizations')
      .where('id', organizationId)
      .select('status')
      .firstOrFail()
    assert.equal(org.status, OrganizationStatus.VERIFIED_SETUP)
  })

  test('unverified portfolio throws E_META_PORTFOLIO_UNVERIFIED and stays pending', async ({
    assert,
  }) => {
    const { organizationId, userId } = await createPendingOrg(ownerUserId)
    orgIds.push(organizationId)
    const phoneNumberId = `pn_uv_${organizationId.slice(0, 8)}`

    const service = new WhatsappEmbeddedSignupService(
      fakeGraph({
        getBusinessPortfolio: async ({ businessId }) => ({
          id: businessId,
          verificationStatus: 'not_verified',
        }),
      })
    )

    try {
      await runWithTenant(organizationId, async () =>
        service.complete({
          organizationId,
          userId,
          input: {
            code: 'auth-code',
            wabaId: 'waba-1',
            phoneNumberId,
            businessId: 'biz-unverified',
          },
        })
      )
      assert.fail('expected unverified portfolio to fail')
    } catch (error) {
      assert.instanceOf(error, WhatsappConfigException)
      assert.equal((error as WhatsappConfigException).code, 'E_META_PORTFOLIO_UNVERIFIED')
      assert.equal((error as WhatsappConfigException).details?.verificationStatus, 'not_verified')
    }

    const org = await db
      .from('organizations')
      .where('id', organizationId)
      .select('status')
      .firstOrFail()
    assert.equal(org.status, OrganizationStatus.PENDING_SETUP)

    const config = await runWithTenant(organizationId, async () =>
      db.from('whatsapp_configs').where('organizationId', organizationId).first()
    )
    assert.equal(config?.status, 'error')
    assert.isFalse(Boolean(config?.subscribedAppsAt))
  })

  test('missing portfolio from Graph throws E_META_ACCOUNT_UNUSABLE', async ({ assert }) => {
    const { organizationId, userId } = await createPendingOrg(ownerUserId)
    orgIds.push(organizationId)

    const service = new WhatsappEmbeddedSignupService(
      fakeGraph({
        getBusinessPortfolio: async () => {
          throw new MetaGraphApiError('portfolio missing', 404, null, 'getBusiness')
        },
      })
    )

    try {
      await runWithTenant(organizationId, async () =>
        service.complete({
          organizationId,
          userId,
          input: {
            code: 'auth-code',
            wabaId: 'waba-1',
            phoneNumberId: `pn_miss_${organizationId.slice(0, 8)}`,
            businessId: 'biz-missing',
          },
        })
      )
      assert.fail('expected missing portfolio to fail')
    } catch (error) {
      assert.instanceOf(error, WhatsappConfigException)
      assert.equal((error as WhatsappConfigException).code, 'E_META_ACCOUNT_UNUSABLE')
    }

    const org = await db
      .from('organizations')
      .where('id', organizationId)
      .select('status')
      .firstOrFail()
    assert.equal(org.status, OrganizationStatus.PENDING_SETUP)
  })

  test('missing phoneNumberId throws E_WA_PHONE_REQUIRED', async ({ assert }) => {
    const { organizationId, userId } = await createPendingOrg(ownerUserId)
    orgIds.push(organizationId)

    try {
      await runWithTenant(organizationId, async () =>
        new WhatsappEmbeddedSignupService(fakeGraph()).complete({
          organizationId,
          userId,
          input: {
            code: 'auth-code',
            wabaId: 'waba-1',
            phoneNumberId: '  ',
          },
        })
      )
      assert.fail('expected phone required')
    } catch (error) {
      assert.instanceOf(error, WhatsappConfigException)
      assert.equal((error as WhatsappConfigException).code, 'E_WA_PHONE_REQUIRED')
    }
  })

  test('resolves businessId from WABA owner when payload omits it', async ({ assert }) => {
    const { organizationId, userId } = await createPendingOrg(ownerUserId)
    orgIds.push(organizationId)
    let sawWabaLookup = false

    const dto = await runWithTenant(organizationId, async () =>
      new WhatsappEmbeddedSignupService(
        fakeGraph({
          getWaba: async ({ wabaId }) => {
            sawWabaLookup = true
            return { id: wabaId, ownerBusinessId: 'biz-from-waba' }
          },
        })
      ).complete({
        organizationId,
        userId,
        input: {
          code: 'auth-code',
          wabaId: 'waba-1',
          phoneNumberId: `pn_own_${organizationId.slice(0, 8)}`,
        },
      })
    )

    assert.isTrue(sawWabaLookup)
    assert.equal(dto.businessId, 'biz-from-waba')
    const org = await db
      .from('organizations')
      .where('id', organizationId)
      .select('status')
      .firstOrFail()
    assert.equal(org.status, OrganizationStatus.VERIFIED_SETUP)
  })
})
