import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import { CatalogStatus } from '#enums/catalog_status'
import { CatalogTemplateSource } from '#enums/catalog_template_source'
import type { MetaGraphClient } from '#lib/meta_whatsapp/graph_client'
import { PlatformTemplateCatalogRepository } from '#repositories/platform_template_catalog_repository'
import { MessageTemplateService } from '#services/message_template_service'
import { PlatformTemplateCatalogService } from '#services/platform_template_catalog_service'
import { runWithTenant } from '#services/tenant_context'

test.group('Platform template catalog install', (group) => {
  group.tap((t) => t.timeout(30_000))
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  group.each.teardown(async () => {
    await db.from('platform_template_catalog').delete()
    await runWithTenant(FIXTURE_IDS.orgs.northstar, () =>
      db.from('message_templates').whereNotNull('catalogTemplateId').delete()
    )
  })

  test('library install calls createMessageTemplateFromLibrary on that org WABA', async ({
    assert,
  }) => {
    const seen: Array<{ wabaId: string; libraryTemplateName: string }> = []
    const graphClient = {
      createMessageTemplateFromLibrary: async (params: {
        wabaId: string
        libraryTemplateName: string
      }) => {
        seen.push({
          wabaId: params.wabaId,
          libraryTemplateName: params.libraryTemplateName,
        })
        return { id: `meta-${params.wabaId}`, status: 'PENDING' }
      },
    } as unknown as MetaGraphClient

    const catalog = await new PlatformTemplateCatalogRepository().insert({
      slug: `lib_install_${Date.now()}`,
      name: `order_update_${Date.now()}`,
      category: 'UTILITY',
      language: 'en_US',
      bodyText: 'Your order {{1}} is confirmed.',
      libraryTemplateName: 'order_management_1',
      source: CatalogTemplateSource.META_LIBRARY,
      status: CatalogStatus.PUBLISHED,
    })

    const templates = new MessageTemplateService(graphClient)
    const service = new PlatformTemplateCatalogService(
      new PlatformTemplateCatalogRepository(),
      templates,
      graphClient
    )

    const installed = await service.installForOrganization({
      catalogId: catalog.id,
      organizationId: FIXTURE_IDS.orgs.northstar,
    })

    assert.equal(seen.length, 1)
    assert.equal(seen[0].wabaId, 'demo-waba-northstar')
    assert.equal(seen[0].libraryTemplateName, 'order_management_1')
    assert.equal(installed.catalogTemplateId, catalog.id)
    assert.equal(installed.metaTemplateId, 'meta-demo-waba-northstar')
  })

  test('manual catalog item uses component create, not library_template_name', async ({
    assert,
  }) => {
    let usedLibrary = false
    let usedComponents = false
    const graphClient = {
      createMessageTemplateFromLibrary: async () => {
        usedLibrary = true
        return { id: 'lib', status: 'PENDING' }
      },
      createMessageTemplate: async () => {
        usedComponents = true
        return { id: 'comp', status: 'PENDING' }
      },
    } as unknown as MetaGraphClient

    const catalog = await new PlatformTemplateCatalogRepository().insert({
      slug: `manual_install_${Date.now()}`,
      name: `manual_hello_${Date.now()}`,
      category: 'UTILITY',
      language: 'en_US',
      bodyText: 'Hello there',
      source: CatalogTemplateSource.MANUAL,
      status: CatalogStatus.PUBLISHED,
    })

    const service = new PlatformTemplateCatalogService(
      new PlatformTemplateCatalogRepository(),
      new MessageTemplateService(graphClient),
      graphClient
    )

    const installed = await service.installForOrganization({
      catalogId: catalog.id,
      organizationId: FIXTURE_IDS.orgs.northstar,
    })

    assert.isFalse(usedLibrary)
    assert.isTrue(usedComponents)
    assert.equal(installed.metaTemplateId, 'comp')
  })

  test('second install of the same catalog id is idempotent', async ({ assert }) => {
    const catalog = await new PlatformTemplateCatalogRepository().insert({
      slug: `idem_${Date.now()}`,
      name: `idem_hello_${Date.now()}`,
      category: 'UTILITY',
      language: 'en_US',
      bodyText: 'Hello',
      source: CatalogTemplateSource.MANUAL,
      status: CatalogStatus.PUBLISHED,
    })

    const graphClient = {
      createMessageTemplate: async () => ({ id: 'comp-idem', status: 'PENDING' }),
    } as unknown as MetaGraphClient
    const service = new PlatformTemplateCatalogService(
      new PlatformTemplateCatalogRepository(),
      new MessageTemplateService(graphClient),
      graphClient
    )

    const first = await service.installForOrganization({
      catalogId: catalog.id,
      organizationId: FIXTURE_IDS.orgs.northstar,
    })
    const second = await service.installForOrganization({
      catalogId: catalog.id,
      organizationId: FIXTURE_IDS.orgs.northstar,
    })
    assert.equal(first.id, second.id)
  })
})
