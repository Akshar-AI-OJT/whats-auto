import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { CatalogStatus } from '#enums/catalog_status'
import { CatalogTemplateSource } from '#enums/catalog_template_source'
import { auth } from '#lib/auth'
import { PlatformTemplateCatalogRepository } from '#repositories/platform_template_catalog_repository'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { runWithTenant } from '#services/tenant_context'

const ADMIN_CATALOG = '/api/v1/super-admin/template-catalog'
const ADMIN_LIBRARY = '/api/v1/super-admin/template-library'
const ORG_CATALOG = '/api/v1/template-catalog'

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
    body: { payload: payload as Record<string, unknown> },
  })
  const token = (signed as { token?: string } | null)?.token
  if (!token) {
    throw new Error(`signJWT returned no token for ${email}`)
  }
  return token
}

async function insertCatalog(params: {
  slug: string
  name: string
  category: string
  language?: string
  industry?: string | null
  topic?: string | null
  status?: string
  source?: string
  bodyText?: string
}) {
  return new PlatformTemplateCatalogRepository().insert({
    slug: params.slug,
    name: params.name,
    category: params.category,
    language: params.language ?? 'en_US',
    bodyText: params.bodyText ?? 'Body {{1}}',
    libraryIndustry: params.industry ?? null,
    libraryTopic: params.topic ?? null,
    source: params.source ?? CatalogTemplateSource.MANUAL,
    status: params.status ?? CatalogStatus.PUBLISHED,
  })
}

test.group('Platform template catalog HTTP', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.each.teardown(async () => {
    await runWithTenant(FIXTURE_IDS.orgs.northstar, () =>
      db.from('message_templates').whereNotNull('catalogTemplateId').delete()
    )
    await runWithTenant(FIXTURE_IDS.orgs.harbor, () =>
      db.from('message_templates').whereNotNull('catalogTemplateId').delete()
    )
    await db.from('platform_template_catalog').delete()
  })

  test('library list without token returns 503', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client.get(ADMIN_LIBRARY).bearerToken(token)
    response.assertStatus(503)
    assert.equal(response.body().code, 'E_TEMPLATE_LIBRARY_TOKEN_MISSING')
  })

  test('tenant cannot call super-admin library routes', async ({ client }) => {
    const token = await mintToken(DEMO_USERS.northstarOwner, FIXTURE_IDS.orgs.northstar)
    const response = await client.get(ADMIN_LIBRARY).bearerToken(token)
    response.assertStatus(403)
  })

  test('admin catalog filters category and language before pagination', async ({
    client,
    assert,
  }) => {
    await insertCatalog({
      slug: 'util_en',
      name: 'util_en',
      category: 'UTILITY',
      language: 'en_US',
    })
    await insertCatalog({
      slug: 'mkt_en',
      name: 'mkt_en',
      category: 'MARKETING',
      language: 'en_US',
    })
    await insertCatalog({
      slug: 'util_hi',
      name: 'util_hi',
      category: 'UTILITY',
      language: 'hi',
    })

    const token = await mintToken(DEMO_USERS.superadmin)
    const response = await client
      .get(ADMIN_CATALOG)
      .qs({ category: 'UTILITY', language: 'en_US', perPage: 50 })
      .bearerToken(token)

    response.assertStatus(200)
    const names = (response.body().data as Array<{ name: string }>).map((row) => row.name)
    assert.deepEqual(names, ['util_en'])
  })

  test('org catalog hides drafts and ignores status/source query', async ({ client, assert }) => {
    await insertCatalog({
      slug: 'pub_mkt',
      name: 'pub_mkt',
      category: 'MARKETING',
      status: CatalogStatus.PUBLISHED,
    })
    await insertCatalog({
      slug: 'draft_mkt',
      name: 'draft_mkt',
      category: 'MARKETING',
      status: CatalogStatus.DRAFT,
    })
    await insertCatalog({
      slug: 'pub_util',
      name: 'pub_util',
      category: 'UTILITY',
      status: CatalogStatus.PUBLISHED,
    })

    const token = await mintToken(DEMO_USERS.northstarOwner, FIXTURE_IDS.orgs.northstar)
    const response = await client
      .get(ORG_CATALOG)
      .qs({ category: 'MARKETING', status: 'DRAFT', source: 'MANUAL' })
      .bearerToken(token)

    response.assertStatus(200)
    const names = (response.body().data as Array<{ name: string; status: string }>).map(
      (row) => row.name
    )
    assert.deepEqual(names, ['pub_mkt'])
  })

  test('org catalog filters industry topic and search', async ({ client, assert }) => {
    await insertCatalog({
      slug: 'ecom_order',
      name: 'ecom_order',
      category: 'UTILITY',
      industry: 'E_COMMERCE',
      topic: 'ORDER_MANAGEMENT',
      bodyText: 'Your parcel is out',
    })
    await insertCatalog({
      slug: 'edu_enroll',
      name: 'edu_enroll',
      category: 'UTILITY',
      industry: 'EDUCATION',
      topic: 'ACCOUNT_UPDATE',
      bodyText: 'Enrollment confirmed',
    })

    const token = await mintToken(DEMO_USERS.northstarOwner, FIXTURE_IDS.orgs.northstar)
    const byIndustry = await client
      .get(ORG_CATALOG)
      .qs({ industry: 'E_COMMERCE' })
      .bearerToken(token)
    assert.deepEqual(
      (byIndustry.body().data as Array<{ name: string }>).map((row) => row.name),
      ['ecom_order']
    )

    const bySearch = await client.get(ORG_CATALOG).qs({ search: 'Enrollment' }).bearerToken(token)
    assert.deepEqual(
      (bySearch.body().data as Array<{ name: string }>).map((row) => row.name),
      ['edu_enroll']
    )
  })

  test('import is idempotent on library name and language', async ({ client, assert }) => {
    const token = await mintToken(DEMO_USERS.superadmin)
    const item = {
      name: 'order_management_1',
      language: 'en_US',
      category: 'UTILITY',
      body: 'Order {{1}} confirmed',
      industry: 'E_COMMERCE',
      topic: 'ORDER_MANAGEMENT',
    }

    const first = await client.post(`${ADMIN_CATALOG}/import`).json({ items: [item] }).bearerToken(token)
    first.assertStatus(200)
    const second = await client
      .post(`${ADMIN_CATALOG}/import`)
      .json({ items: [item] })
      .bearerToken(token)
    second.assertStatus(200)

    const listed = await client.get(ADMIN_CATALOG).qs({ perPage: 100 }).bearerToken(token)
    const matches = (listed.body().data as Array<{ libraryTemplateName: string; language: string }>)
      .filter((row) => row.libraryTemplateName === 'order_management_1' && row.language === 'en_US')
    assert.equal(matches.length, 1)
  })

  test('two orgs see the same published catalog row', async ({ client, assert }) => {
    const row = await insertCatalog({
      slug: 'shared_hello',
      name: 'shared_hello',
      category: 'UTILITY',
    })

    const north = await mintToken(DEMO_USERS.northstarOwner, FIXTURE_IDS.orgs.northstar)
    const harbor = await mintToken(DEMO_USERS.harborOwner, FIXTURE_IDS.orgs.harbor)
    const a = await client.get(ORG_CATALOG).bearerToken(north)
    const b = await client.get(ORG_CATALOG).bearerToken(harbor)
    const idsA = (a.body().data as Array<{ id: string }>).map((item) => item.id)
    const idsB = (b.body().data as Array<{ id: string }>).map((item) => item.id)
    assert.include(idsA, row.id)
    assert.include(idsB, row.id)
  })

  test('install skips customTemplates and is blocked by maxTemplates', async ({
    client,
    assert,
  }) => {
    const catalog = await insertCatalog({
      slug: 'install_hello',
      name: 'install_hello',
      category: 'UTILITY',
    })
    const plan = await db.from('plans').where('id', FIXTURE_IDS.plans.starter).first()
    const originalMetadata = plan.metadata
    const originalLimits = plan.limits

    const metadata =
      typeof originalMetadata === 'string' ? JSON.parse(originalMetadata) : originalMetadata
    const limits = typeof originalLimits === 'string' ? JSON.parse(originalLimits) : originalLimits
    const existingFeatures = Array.isArray(metadata.features)
      ? (metadata.features as Array<{ key: string; enabled: boolean }>)
      : []
    const features = existingFeatures.some((feature) => feature.key === 'customTemplates')
      ? existingFeatures.map((feature) =>
          feature.key === 'customTemplates' ? { ...feature, enabled: false } : feature
        )
      : [{ key: 'customTemplates', enabled: false }]

    try {
      await db
        .from('plans')
        .where('id', FIXTURE_IDS.plans.starter)
        .update({
          metadata: JSON.stringify({ ...metadata, features }),
          limits: JSON.stringify({ ...limits, maxTemplates: 100 }),
        })

      const token = await mintToken(DEMO_USERS.harborOwner, FIXTURE_IDS.orgs.harbor)
      const customCreate = await client
        .post('/api/v1/whatsapp/templates')
        .json({
          name: 'custom_blocked',
          category: 'UTILITY',
          language: 'en_US',
          bodyText: 'Hi',
        })
        .bearerToken(token)
      customCreate.assertStatus(403)

      const installed = await client
        .post(`${ORG_CATALOG}/${catalog.id}/install`)
        .bearerToken(token)
      installed.assertStatus(200)
      assert.equal(installed.body().data.catalogTemplateId, catalog.id)

      await db
        .from('plans')
        .where('id', FIXTURE_IDS.plans.starter)
        .update({
          metadata: JSON.stringify({ ...metadata, features }),
          limits: JSON.stringify({ ...limits, maxTemplates: 0 }),
        })

      const secondCatalog = await insertCatalog({
        slug: 'install_quota',
        name: 'install_quota',
        category: 'UTILITY',
      })
      const blocked = await client
        .post(`${ORG_CATALOG}/${secondCatalog.id}/install`)
        .bearerToken(token)
      blocked.assertStatus(403)
    } finally {
      await db
        .from('plans')
        .where('id', FIXTURE_IDS.plans.starter)
        .update({
          metadata:
            typeof originalMetadata === 'string'
              ? originalMetadata
              : JSON.stringify(originalMetadata),
          limits:
            typeof originalLimits === 'string' ? originalLimits : JSON.stringify(originalLimits),
        })
    }
  })

  test('org A cannot read org B catalog clone', async ({ client }) => {
    const catalog = await insertCatalog({
      slug: 'rls_hello',
      name: 'rls_hello',
      category: 'UTILITY',
    })
    const harborToken = await mintToken(DEMO_USERS.harborOwner, FIXTURE_IDS.orgs.harbor)
    const installed = await client
      .post(`${ORG_CATALOG}/${catalog.id}/install`)
      .bearerToken(harborToken)
    installed.assertStatus(200)
    const cloneId = installed.body().data.id as string

    const northToken = await mintToken(DEMO_USERS.northstarOwner, FIXTURE_IDS.orgs.northstar)
    const peek = await client.get(`/api/v1/whatsapp/templates/${cloneId}`).bearerToken(northToken)
    peek.assertStatus(404)
  })
})
