import { test } from '@japa/runner'
import { createCampaignValidator, updateCampaignValidator } from '#validators/campaign'

const validMappings = {
  customer_name: { source: 'contact_field' as const, field: 'name' },
  order_id: { source: 'custom_field' as const, field: 'order_id' },
  promo_code: { source: 'static' as const, value: 'SUMMER26' },
}

test.group('Campaign variableMappings validator', () => {
  test('create accepts omitted variableMappings', async ({ assert }) => {
    const payload = await createCampaignValidator.validate({
      name: 'July Product Launch',
    })
    assert.equal(payload.name, 'July Product Launch')
    assert.isUndefined(payload.variableMappings)
  })

  test('create accepts a valid variableMappings object', async ({ assert }) => {
    const payload = await createCampaignValidator.validate({
      name: 'July Product Launch',
      variableMappings: validMappings,
    })
    assert.deepEqual(payload.variableMappings, validMappings)
  })

  test('update can clear variableMappings with null', async ({ assert }) => {
    const payload = await updateCampaignValidator.validate({
      variableMappings: null,
    })
    assert.isNull(payload.variableMappings)
  })

  test('rejects an invalid mapping source', async ({ assert }) => {
    await assert.rejects(() =>
      createCampaignValidator.validate({
        name: 'July Product Launch',
        variableMappings: {
          customer_name: { source: 'template_field', field: 'name' },
        },
      })
    )
  })

  test('rejects a contact_field mapping without field', async ({ assert }) => {
    await assert.rejects(() =>
      createCampaignValidator.validate({
        name: 'July Product Launch',
        variableMappings: {
          customer_name: { source: 'contact_field' },
        },
      })
    )
  })

  test('rejects a contact_field mapping with an empty field', async ({ assert }) => {
    await assert.rejects(() =>
      createCampaignValidator.validate({
        name: 'July Product Launch',
        variableMappings: {
          customer_name: { source: 'contact_field', field: '   ' },
        },
      })
    )
  })

  test('rejects a custom_field mapping without field', async ({ assert }) => {
    await assert.rejects(() =>
      createCampaignValidator.validate({
        name: 'July Product Launch',
        variableMappings: {
          order_id: { source: 'custom_field' },
        },
      })
    )
  })

  test('rejects a static mapping without value', async ({ assert }) => {
    await assert.rejects(() =>
      createCampaignValidator.validate({
        name: 'July Product Launch',
        variableMappings: {
          promo_code: { source: 'static' },
        },
      })
    )
  })

  test('rejects a static mapping with a non-string value', async ({ assert }) => {
    await assert.rejects(() =>
      createCampaignValidator.validate({
        name: 'July Product Launch',
        variableMappings: {
          promo_code: { source: 'static', value: 26 },
        },
      })
    )
  })
})
