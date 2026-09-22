import { test } from '@japa/runner'
import { normalizeTemplateLanguage, parseWebhookChange } from '#lib/meta_whatsapp/webhook_parser'

test.group('parseWebhookChange', () => {
  test('parses message_template_status_update APPROVED and normalizes language', ({ assert }) => {
    const result = parseWebhookChange({
      field: 'message_template_status_update',
      value: {
        event: 'APPROVED',
        message_template_id: 1689556908129832,
        message_template_name: 'order_confirmation',
        message_template_language: 'en-US',
        reason: 'NONE',
        message_template_category: 'UTILITY',
      },
    })
    assert.deepEqual(result, {
      kind: 'template_status',
      event: 'APPROVED',
      metaTemplateId: '1689556908129832',
      name: 'order_confirmation',
      language: 'en_US',
      reason: 'NONE',
      category: 'UTILITY',
    })
  })

  test('parses REJECTED with rejection_info into reason', ({ assert }) => {
    const result = parseWebhookChange({
      field: 'message_template_status_update',
      value: {
        event: 'REJECTED',
        message_template_id: 'tmpl-9',
        message_template_name: 'abandoned_cart',
        message_template_language: 'en',
        reason: 'INVALID_FORMAT',
        message_template_category: 'MARKETING',
        rejection_info: {
          reason: 'Variables are adjacent.',
          recommendation: 'Separate variables with text.',
        },
      },
    })
    assert.equal(result.kind, 'template_status')
    if (result.kind !== 'template_status') return
    assert.equal(result.event, 'REJECTED')
    assert.equal(result.metaTemplateId, 'tmpl-9')
    assert.include(result.reason ?? '', 'Variables are adjacent.')
    assert.include(result.reason ?? '', 'Separate variables with text.')
  })

  test('skips malformed message_template_status_update', ({ assert }) => {
    const result = parseWebhookChange({
      field: 'message_template_status_update',
      value: { event: 'APPROVED' },
    })
    assert.deepEqual(result, {
      kind: 'skip',
      reason: 'malformed_value',
      field: 'message_template_status_update',
    })
  })

  test('skips unsupported fields', ({ assert }) => {
    const result = parseWebhookChange({
      field: 'message_template_quality_update',
      value: { metadata: { phone_number_id: '1' } },
    })
    assert.deepEqual(result, {
      kind: 'skip',
      reason: 'unsupported_field',
      field: 'message_template_quality_update',
    })
  })

  test('normalizeTemplateLanguage replaces hyphens', ({ assert }) => {
    assert.equal(normalizeTemplateLanguage('en-US'), 'en_US')
    assert.equal(normalizeTemplateLanguage('pt_BR'), 'pt_BR')
  })

  test('skips malformed values', ({ assert }) => {
    const result = parseWebhookChange({ field: 'messages', value: null })
    assert.equal(result.kind, 'skip')
    if (result.kind === 'skip') {
      assert.equal(result.reason, 'malformed_value')
    }
  })

  test('skips when phone_number_id is missing', ({ assert }) => {
    const result = parseWebhookChange({
      field: 'messages',
      value: { messages: [] },
    })
    assert.deepEqual(result, {
      kind: 'skip',
      reason: 'missing_phone_number_id',
      field: 'messages',
    })
  })

  test('parses text, media, location, and interactive inbound messages', ({ assert }) => {
    const result = parseWebhookChange({
      field: 'messages',
      value: {
        metadata: { phone_number_id: 'pn-1', display_phone_number: '+15550001111' },
        contacts: [{ wa_id: '15551234567', profile: { name: 'Ada' } }],
        messages: [
          {
            from: '15551234567',
            id: 'wamid.text',
            timestamp: '1700000000',
            type: 'text',
            text: { body: 'Hello' },
          },
          {
            from: '15551234567',
            id: 'wamid.image',
            timestamp: '1700000001',
            type: 'image',
            image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'Pic' },
          },
          {
            from: '15551234567',
            id: 'wamid.location',
            timestamp: '1700000002',
            type: 'location',
            location: { latitude: 1.2, longitude: 3.4, name: 'HQ' },
          },
          {
            from: '15551234567',
            id: 'wamid.interactive',
            timestamp: '1700000003',
            type: 'interactive',
            interactive: {
              type: 'button_reply',
              button_reply: { id: 'btn-1', title: 'Yes' },
            },
          },
        ],
      },
    })

    assert.equal(result.kind, 'inbox')
    if (result.kind !== 'inbox') return

    assert.equal(result.phoneNumberId, 'pn-1')
    assert.lengthOf(result.messages, 4)

    assert.equal(result.messages[0].contentType, 'text')
    assert.equal(result.messages[0].contentText, 'Hello')
    assert.equal(result.messages[0].profileName, 'Ada')

    assert.equal(result.messages[1].contentType, 'image')
    assert.deepEqual(result.messages[1].metadata.media, {
      id: 'media-1',
      mimeType: 'image/jpeg',
      caption: 'Pic',
      filename: undefined,
      sha256: undefined,
    })

    assert.equal(result.messages[2].contentType, 'location')
    assert.equal(result.messages[2].metadata.location?.name, 'HQ')

    assert.equal(result.messages[3].contentType, 'interactive')
    assert.equal(result.messages[3].metadata.interactive?.buttonReply?.title, 'Yes')
    assert.equal(result.messages[3].contentText, 'Yes')
    assert.isNull(result.messages[3].contextProviderMessageId)
  })

  test('parses context.id and referral onto inbound metadata', ({ assert }) => {
    const result = parseWebhookChange({
      field: 'messages',
      value: {
        metadata: { phone_number_id: 'pn-1' },
        contacts: [{ wa_id: '15551234567' }],
        messages: [
          {
            from: '15551234567',
            id: 'wamid.reply',
            timestamp: '1700000004',
            type: 'interactive',
            context: { id: 'wamid.out.campaign', from: '15550001111' },
            referral: {
              source_type: 'ad',
              source_id: 'ad-1',
              source_url: 'https://fb.me/ad',
              headline: 'Sale',
              ctwa_clid: 'clid-1',
            },
            interactive: {
              type: 'button_reply',
              button_reply: { id: 'yes', title: 'Yes' },
            },
          },
        ],
      },
    })

    assert.equal(result.kind, 'inbox')
    if (result.kind !== 'inbox') return

    const inbound = result.messages[0]!
    assert.equal(inbound.contextProviderMessageId, 'wamid.out.campaign')
    assert.deepEqual(inbound.metadata.context, {
      id: 'wamid.out.campaign',
      from: '15550001111',
    })
    assert.equal(inbound.metadata.referral?.sourceId, 'ad-1')
    assert.equal(inbound.metadata.referral?.sourceType, 'ad')
    assert.equal(inbound.metadata.referral?.ctwaClid, 'clid-1')
  })

  test('parses delivery status receipts including failures', ({ assert }) => {
    const result = parseWebhookChange({
      field: 'messages',
      value: {
        metadata: { phone_number_id: 'pn-1' },
        statuses: [
          {
            id: 'wamid.out',
            status: 'delivered',
            timestamp: '1700000100',
            recipient_id: '15551234567',
          },
          {
            id: 'wamid.fail',
            status: 'failed',
            timestamp: '1700000101',
            errors: [
              { code: 131026, title: 'Message undeliverable', error_data: { details: 'x' } },
            ],
          },
        ],
      },
    })

    assert.equal(result.kind, 'inbox')
    if (result.kind !== 'inbox') return

    assert.lengthOf(result.statuses, 2)
    assert.equal(result.statuses[0].status, 'delivered')
    assert.equal(result.statuses[1].status, 'failed')
    assert.include(result.statuses[1].errorMessage ?? '', '131026')
  })

  test('drops unsupported message types without failing the change', ({ assert }) => {
    const result = parseWebhookChange({
      field: 'messages',
      value: {
        metadata: { phone_number_id: 'pn-1' },
        messages: [
          {
            from: '1',
            id: 'wamid.sticker',
            timestamp: '1700000000',
            type: 'sticker',
          },
        ],
      },
    })

    assert.equal(result.kind, 'inbox')
    if (result.kind !== 'inbox') return
    assert.lengthOf(result.messages, 0)
  })
})
