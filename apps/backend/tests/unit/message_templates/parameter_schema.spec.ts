import { test } from '@japa/runner'
import { MessageTemplateService } from '#services/message_template_service'

test.group('MessageTemplateService parameterSchema', () => {
  test('toDto narrows stored parameterSchema', ({ assert }) => {
    const service = new MessageTemplateService()
    const dto = service.toDto({
      id: '11111111-1111-1111-1111-111111111111',
      organizationId: '22222222-2222-2222-2222-222222222222',
      name: 'order_update',
      category: 'UTILITY',
      language: 'en_US',
      bodyText: 'Hi {{name}}',
      parameterSchema: {
        headerNames: [],
        bodyNames: ['name'],
        sendable: true,
      },
      status: 'approved',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: null,
    })

    assert.deepEqual(dto.parameterSchema, {
      headerNames: [],
      bodyNames: ['name'],
      sendable: true,
      unsupportedReason: undefined,
    })
  })

  test('toDto treats empty parameterSchema as non-sendable', ({ assert }) => {
    const service = new MessageTemplateService()
    const dto = service.toDto({
      id: '11111111-1111-1111-1111-111111111111',
      organizationId: '22222222-2222-2222-2222-222222222222',
      name: 'legacy',
      category: 'UTILITY',
      language: 'en_US',
      bodyText: 'Hello {{1}}',
      parameterSchema: {},
      status: 'approved',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: null,
    })

    assert.isFalse(dto.parameterSchema.sendable)
  })

  test('create validator accepts category/header enums after normalize', async ({ assert }) => {
    const { createMessageTemplateValidator } = await import('#validators/message_template')
    const payload = await createMessageTemplateValidator.validate({
      name: 'order_update',
      category: 'utility',
      language: 'en_US',
      headerType: 'text',
      headerContent: 'Hi {{first_name}}',
      bodyText: 'Order {{order_id}} ready',
    })

    assert.equal(payload.category, 'UTILITY')
    assert.equal(payload.headerType, 'TEXT')
  })

  test('create validator rejects unknown category', async ({ assert }) => {
    const { createMessageTemplateValidator } = await import('#validators/message_template')
    await assert.rejects(() =>
      createMessageTemplateValidator.validate({
        name: 'order_update',
        category: 'PROMO',
        language: 'en_US',
        bodyText: 'Hello',
      })
    )
  })
})
