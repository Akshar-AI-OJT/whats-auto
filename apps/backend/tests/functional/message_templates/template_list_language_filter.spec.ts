import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { MessageTemplateService } from '#services/message_template_service'
import { listMessageTemplatesValidator } from '#validators/message_template'
import { runWithTenant } from '#services/tenant_context'

async function createOrg() {
  const id = randomUUID()
  const slug = `tpl-lang-${id.slice(0, 8)}`
  const [row] = await db
    .table('organizations')
    .insert({
      id,
      name: `Template Language ${slug}`,
      slug,
      email: `${slug}@example.com`,
      country: 'US',
      timezone: 'UTC',
      currency: 'USD',
      status: 'active',
    })
    .returning(['id'])
  return row.id as string
}

async function seedTemplate(params: {
  organizationId: string
  name: string
  language: string
  status?: string
  category?: string
  bodyText?: string
}) {
  return runWithTenant(params.organizationId, async () => {
    const [row] = await db
      .table('message_templates')
      .insert({
        organizationId: params.organizationId,
        name: params.name,
        category: params.category ?? 'UTILITY',
        language: params.language,
        headerType: 'none',
        bodyText: params.bodyText ?? 'Hello {{1}}',
        parameterSchema: {
          headerNames: [],
          bodyNames: ['1'],
          sendable: true,
        },
        status: params.status ?? 'approved',
      })
      .returning(['id'])
    return row.id as string
  })
}

test.group('listMessageTemplatesValidator language param', () => {
  test('accepts a language code matching the create validator', async ({ assert }) => {
    const payload = await listMessageTemplatesValidator.validate({ language: 'en_US' })
    assert.equal(payload.language, 'en_US')
  })

  test('rejects language values that are too short or too long', async ({ assert }) => {
    await assert.rejects(() => listMessageTemplatesValidator.validate({ language: 'x' }))
    await assert.rejects(() =>
      listMessageTemplatesValidator.validate({ language: 'this_is_too_long' })
    )
  })
})

test.group('MessageTemplateService list language filter', (group) => {
  const orgIds: string[] = []

  group.teardown(async () => {
    for (const organizationId of orgIds) {
      await runWithTenant(organizationId, async () => {
        await db.from('message_templates').where('organizationId', organizationId).delete()
      })
      await db.from('organizations').where('id', organizationId).delete()
    }
  })

  test('keeps templates in the selected language and excludes others', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)

    const hiId = await seedTemplate({
      organizationId,
      name: `hi_inside_${randomUUID().slice(0, 8)}`,
      language: 'hi',
    })
    const enId = await seedTemplate({
      organizationId,
      name: `en_outside_${randomUUID().slice(0, 8)}`,
      language: 'en_US',
    })
    const esId = await seedTemplate({
      organizationId,
      name: `es_outside_${randomUUID().slice(0, 8)}`,
      language: 'es',
    })

    const listed = await runWithTenant(organizationId, () =>
      new MessageTemplateService().listTemplatesPaginated({
        organizationId,
        language: 'hi',
        perPage: 20,
      })
    )

    const ids = listed.data.map((row) => row.id)
    assert.include(ids, hiId)
    assert.notInclude(ids, enId)
    assert.notInclude(ids, esId)
    assert.equal(listed.meta.total, 1)
    assert.equal(listed.meta.currentPage, 1)
    assert.equal(listed.meta.perPage, 20)
    assert.equal(listed.meta.lastPage, 1)
    assert.isTrue(listed.data.every((row) => row.language === 'hi'))
  })

  test('pagination meta.total reflects the language-filtered set', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)

    const inLanguage: string[] = []
    for (let index = 0; index < 3; index++) {
      inLanguage.push(
        await seedTemplate({
          organizationId,
          name: `hi_page_${index}_${randomUUID().slice(0, 8)}`,
          language: 'hi',
        })
      )
    }
    await seedTemplate({
      organizationId,
      name: `en_outsider_${randomUUID().slice(0, 8)}`,
      language: 'en_US',
    })

    const page1 = await runWithTenant(organizationId, () =>
      new MessageTemplateService().listTemplatesPaginated({
        organizationId,
        language: 'hi',
        page: 1,
        perPage: 2,
      })
    )
    const page2 = await runWithTenant(organizationId, () =>
      new MessageTemplateService().listTemplatesPaginated({
        organizationId,
        language: 'hi',
        page: 2,
        perPage: 2,
      })
    )

    assert.equal(page1.meta.total, 3)
    assert.equal(page1.meta.perPage, 2)
    assert.equal(page1.meta.currentPage, 1)
    assert.equal(page1.meta.lastPage, 2)
    assert.equal(page1.data.length, 2)
    assert.equal(page2.meta.total, 3)
    assert.equal(page2.meta.currentPage, 2)
    assert.equal(page2.data.length, 1)
    assert.isTrue(page1.data.every((row) => row.language === 'hi'))
    assert.isTrue(page2.data.every((row) => row.language === 'hi'))

    const page1Ids = new Set(page1.data.map((row) => row.id))
    assert.isFalse(page1Ids.has(page2.data[0]!.id))
    assert.isTrue(page1.data.every((row) => inLanguage.includes(row.id)))
    assert.isTrue(inLanguage.includes(page2.data[0]!.id))
  })

  test('does not return templates from another organization', async ({ assert }) => {
    const organizationId = await createOrg()
    const foreignOrgId = await createOrg()
    orgIds.push(organizationId, foreignOrgId)

    const ownId = await seedTemplate({
      organizationId,
      name: `own_hi_${randomUUID().slice(0, 8)}`,
      language: 'hi',
    })
    const foreignId = await seedTemplate({
      organizationId: foreignOrgId,
      name: `foreign_hi_${randomUUID().slice(0, 8)}`,
      language: 'hi',
    })

    const listed = await runWithTenant(organizationId, () =>
      new MessageTemplateService().listTemplatesPaginated({
        organizationId,
        language: 'hi',
        perPage: 20,
      })
    )

    const ids = listed.data.map((row) => row.id)
    assert.include(ids, ownId)
    assert.notInclude(ids, foreignId)
    assert.equal(listed.meta.total, 1)
    assert.isTrue(listed.data.every((row) => row.organizationId === organizationId))
  })

  test('language filter still applies with search, status, and category', async ({ assert }) => {
    const organizationId = await createOrg()
    orgIds.push(organizationId)

    const matchId = await seedTemplate({
      organizationId,
      name: `needle_hi_util_${randomUUID().slice(0, 8)}`,
      language: 'hi',
      status: 'approved',
      category: 'UTILITY',
      bodyText: 'Needle body for hindi utility',
    })
    await seedTemplate({
      organizationId,
      name: `needle_en_util_${randomUUID().slice(0, 8)}`,
      language: 'en_US',
      status: 'approved',
      category: 'UTILITY',
      bodyText: 'Needle body for english utility',
    })
    await seedTemplate({
      organizationId,
      name: `other_hi_util_${randomUUID().slice(0, 8)}`,
      language: 'hi',
      status: 'draft',
      category: 'UTILITY',
    })
    await seedTemplate({
      organizationId,
      name: `needle_hi_mkt_${randomUUID().slice(0, 8)}`,
      language: 'hi',
      status: 'approved',
      category: 'MARKETING',
    })

    const listed = await runWithTenant(organizationId, () =>
      new MessageTemplateService().listTemplatesPaginated({
        organizationId,
        language: 'hi',
        search: 'needle',
        status: 'approved',
        category: 'UTILITY',
        perPage: 20,
      })
    )

    assert.equal(listed.meta.total, 1)
    assert.equal(listed.data.length, 1)
    assert.equal(listed.data[0]!.id, matchId)
    assert.equal(listed.data[0]!.language, 'hi')
    assert.equal(listed.data[0]!.status, 'approved')
    assert.equal(listed.data[0]!.category, 'UTILITY')
  })
})
