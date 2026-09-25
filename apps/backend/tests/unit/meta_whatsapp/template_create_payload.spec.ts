import { test } from '@japa/runner'
import {
  buildMetaCreateComponents,
  libraryTemplateButtonInputs,
  metaTemplateTextIssue,
  prepareTemplateSubmission,
} from '#lib/meta_whatsapp/template_create_payload'
import type { TemplateParameterSchema } from '#lib/meta_whatsapp/types'

const positionalBody: TemplateParameterSchema = {
  headerNames: [],
  bodyNames: ['1'],
  urlButtons: [],
  sendable: true,
  parameterFormat: 'positional',
}

const namedBody: TemplateParameterSchema = {
  headerNames: ['event_name'],
  bodyNames: ['event_name'],
  urlButtons: [],
  sendable: true,
  parameterFormat: 'named',
}

test.group('template create payload', () => {
  test('positional samples stay in body_text', ({ assert }) => {
    const components = buildMetaCreateComponents({
      bodyText: 'Hello {{1}}, your table is ready.',
      sampleValues: { '1': 'Ada' },
      parameterSchema: positionalBody,
      headerHandle: null,
    })
    assert.deepEqual(components[0].example, { body_text: [['Ada']] })
  })

  test('named samples use body_text_named_params and header_text_named_params', ({ assert }) => {
    const components = buildMetaCreateComponents({
      headerType: 'text',
      headerContent: 'Reminder {{event_name}}',
      bodyText: 'Join us for {{event_name}} today.',
      sampleValues: { event_name: 'Launch' },
      parameterSchema: namedBody,
      headerHandle: null,
    })
    assert.deepEqual(components[0].example, {
      header_text_named_params: [{ param_name: 'event_name', example: 'Launch' }],
    })
    assert.deepEqual(components[1].example, {
      body_text_named_params: [{ param_name: 'event_name', example: 'Launch' }],
    })
  })

  test('URL button examples are complete URLs', ({ assert }) => {
    const schema: TemplateParameterSchema = {
      headerNames: [],
      bodyNames: [],
      urlButtons: [{ name: '1', index: 0 }],
      sendable: true,
      parameterFormat: 'positional',
    }
    const components = buildMetaCreateComponents({
      bodyText: 'Tap below to track the shipment.',
      buttons: [{ type: 'URL', text: 'Track', url: 'https://shop.example/o/{{1}}' }],
      sampleValues: { '1': 'A100' },
      parameterSchema: schema,
      headerHandle: null,
    })
    const buttons = components.find((component) => component.type === 'BUTTONS')?.buttons
    assert.deepEqual(buttons?.[0]?.example, ['https://shop.example/o/A100'])
  })

  test('omits a media header when Meta has no sample handle', ({ assert }) => {
    const components = buildMetaCreateComponents({
      headerType: 'image',
      bodyText: 'See the photo.',
      parameterSchema: {
        headerNames: [],
        bodyNames: [],
        urlButtons: [],
        sendable: true,
      },
      headerHandle: null,
    })
    assert.equal(
      components.some((component) => component.type === 'HEADER'),
      false
    )
  })

  test('library URL buttons use base_url and a full suffix example', ({ assert }) => {
    const inputs = libraryTemplateButtonInputs(
      [
        { type: 'URL', text: 'Track', url: { base_url: 'https://shop.example/o/{{1}}' } },
        { type: 'QUICK_REPLY', text: 'Thanks' },
      ],
      { '1': 'A100' }
    )
    assert.deepEqual(inputs, [
      {
        type: 'URL',
        url: {
          base_url: 'https://shop.example/o/{{1}}',
          url_suffix_example: 'https://shop.example/o/A100',
        },
      },
    ])
  })

  test('lowercases named placeholders and sample keys together', ({ assert }) => {
    const prepared = prepareTemplateSubmission({
      bodyText: 'Thanks {{Customer_Name}} for the order.',
      sampleValues: { Customer_Name: 'Ada' },
    })
    assert.equal(prepared.bodyText, 'Thanks {{customer_name}} for the order.')
    assert.deepEqual(prepared.sampleValues, { customer_name: 'Ada' })
  })

  test('flags body text that starts or ends with a variable', ({ assert }) => {
    assert.match(metaTemplateTextIssue({ bodyText: 'Hello {{1}}' }) ?? '', /cannot start or end/)
    assert.isNull(metaTemplateTextIssue({ bodyText: 'Hello {{1}}, welcome.' }))
    assert.match(
      metaTemplateTextIssue({ bodyText: 'Hello.', footerText: 'Ref {{1}}' }) ?? '',
      /Footer/
    )
  })
})
