import { test } from '@japa/runner'
import {
  deriveParameterSchema,
  detectParameterFormat,
  extractTemplatePlaceholders,
  mapNamedParametersToMetaComponents,
  parseParameterSchema,
  pickRequiredParameterValues,
  TemplateParameterError,
} from '#lib/meta_whatsapp/template_parameters'

test.group('extractTemplatePlaceholders / detectParameterFormat', () => {
  test('extracts named and numbered placeholders', ({ assert }) => {
    assert.deepEqual(extractTemplatePlaceholders('Hi {{first_name}}, order {{order_id}}'), [
      'first_name',
      'order_id',
    ])
    assert.deepEqual(extractTemplatePlaceholders('Hello {{1}}, code {{2}}'), ['1', '2'])
    assert.deepEqual(extractTemplatePlaceholders('No vars'), [])
  })

  test('detects named, positional, mixed, and empty', ({ assert }) => {
    assert.equal(detectParameterFormat(['first_name', 'order_id']), 'named')
    assert.equal(detectParameterFormat(['2', '1']), 'positional')
    assert.equal(detectParameterFormat(['1', 'name']), 'mixed')
    assert.isNull(detectParameterFormat([]))
  })
})

test.group('deriveParameterSchema', () => {
  test('extracts named body and text-header variables', ({ assert }) => {
    const schema = deriveParameterSchema({
      headerType: 'text',
      headerContent: 'Hi {{first_name}}',
      bodyText: 'Your order {{order_id}} ships today.',
    })

    assert.isTrue(schema.sendable)
    assert.equal(schema.parameterFormat, 'named')
    assert.deepEqual(schema.headerNames, ['first_name'])
    assert.deepEqual(schema.bodyNames, ['order_id'])
    assert.isUndefined(schema.headerMediaType)
  })

  test('accepts numbered placeholders as positional sendable', ({ assert }) => {
    const schema = deriveParameterSchema({
      bodyText: 'Hello {{1}}, your code is {{2}}',
    })

    assert.isTrue(schema.sendable)
    assert.equal(schema.parameterFormat, 'positional')
    assert.deepEqual(schema.bodyNames, ['1', '2'])
  })

  test('sorts positional body names numerically', ({ assert }) => {
    const schema = deriveParameterSchema({
      bodyText: 'Code {{10}} then {{2}} then {{1}}',
    })

    assert.isTrue(schema.sendable)
    assert.deepEqual(schema.bodyNames, ['1', '2', '10'])
  })

  test('rejects mixed numbered and named placeholders', ({ assert }) => {
    const schema = deriveParameterSchema({
      bodyText: 'Hello {{1}}, your name is {{name}}',
    })

    assert.isFalse(schema.sendable)
    assert.include(schema.unsupportedReason ?? '', 'Mixed')
  })

  test('marks image media headers sendable with headerMediaType and body names', ({ assert }) => {
    const schema = deriveParameterSchema({
      headerType: 'image',
      headerContent: 'https://example.com/x.jpg',
      bodyText: 'See {{product}}',
    })

    assert.isTrue(schema.sendable)
    assert.equal(schema.headerMediaType, 'image')
    assert.equal(schema.parameterFormat, 'named')
    assert.deepEqual(schema.headerNames, [])
    assert.deepEqual(schema.bodyNames, ['product'])
  })

  test('rejects video headers', ({ assert }) => {
    const schema = deriveParameterSchema({
      headerType: 'video',
      bodyText: 'Watch this',
    })

    assert.isFalse(schema.sendable)
    assert.include(schema.unsupportedReason ?? '', 'Video')
  })

  test('marks document headers sendable for integrations', ({ assert }) => {
    const schema = deriveParameterSchema({
      headerType: 'document',
      bodyText: 'Invoice {{id}}',
    })

    assert.isTrue(schema.sendable)
    assert.equal(schema.headerMediaType, 'document')
    assert.deepEqual(schema.bodyNames, ['id'])
  })

  test('media header with numbered body is positional sendable', ({ assert }) => {
    const schema = deriveParameterSchema({
      headerType: 'document',
      bodyText: 'Invoice {{1}}',
    })

    assert.isTrue(schema.sendable)
    assert.equal(schema.parameterFormat, 'positional')
    assert.deepEqual(schema.bodyNames, ['1'])
  })

  test('allows named URL button variables', ({ assert }) => {
    const schema = deriveParameterSchema({
      bodyText: 'Tap below {{name}}',
      buttons: [
        { type: 'QUICK_REPLY', text: 'Thanks' },
        { type: 'URL', text: 'Open', url: 'https://x.com/{{cta_url}}' },
      ],
    })

    assert.isTrue(schema.sendable)
    assert.equal(schema.parameterFormat, 'named')
    assert.deepEqual(schema.bodyNames, ['name'])
    assert.deepEqual(schema.urlButtons, [{ name: 'cta_url', index: 1 }])
  })

  test('allows positional URL button placeholders when body is also positional', ({ assert }) => {
    const schema = deriveParameterSchema({
      bodyText: 'Tap below {{1}}',
      buttons: [{ type: 'URL', text: 'Open', url: 'https://x.com/{{2}}' }],
    })

    assert.isTrue(schema.sendable)
    assert.equal(schema.parameterFormat, 'positional')
    assert.deepEqual(schema.bodyNames, ['1'])
    assert.deepEqual(schema.urlButtons, [{ name: '2', index: 0 }])
  })

  test('rejects mixed format between body and URL button', ({ assert }) => {
    const schema = deriveParameterSchema({
      bodyText: 'Tap below {{name}}',
      buttons: [{ type: 'URL', text: 'Open', url: 'https://x.com/{{1}}' }],
    })

    assert.isFalse(schema.sendable)
    assert.include(schema.unsupportedReason ?? '', 'Mixed')
  })

  test('rejects named variables on non-URL buttons', ({ assert }) => {
    const schema = deriveParameterSchema({
      bodyText: 'Tap below',
      buttons: [{ type: 'QUICK_REPLY', text: 'Yes {{choice}}' }],
    })

    assert.isFalse(schema.sendable)
    assert.include(schema.unsupportedReason ?? '', 'URL buttons')
  })

  test('rejects duplicate named URL button variables', ({ assert }) => {
    const schema = deriveParameterSchema({
      bodyText: 'Tap below',
      buttons: [
        { type: 'URL', text: 'A', url: 'https://a.com/{{cta_url}}' },
        { type: 'URL', text: 'B', url: 'https://b.com/{{cta_url}}' },
      ],
    })

    assert.isFalse(schema.sendable)
    assert.include(schema.unsupportedReason ?? '', 'Duplicate')
  })

  test('static URL buttons remain sendable without urlButtons', ({ assert }) => {
    const schema = deriveParameterSchema({
      bodyText: 'Tap below',
      buttons: [{ type: 'URL', text: 'Open', url: 'https://x.com/shop' }],
    })

    assert.isTrue(schema.sendable)
    assert.deepEqual(schema.urlButtons, [])
    assert.isUndefined(schema.parameterFormat)
  })

  test('parameterless body is sendable', ({ assert }) => {
    const schema = deriveParameterSchema({
      headerType: 'none',
      bodyText: 'Hello world',
    })

    assert.isTrue(schema.sendable)
    assert.deepEqual(schema.headerNames, [])
    assert.deepEqual(schema.bodyNames, [])
    assert.isUndefined(schema.parameterFormat)
  })
})

test.group('mapNamedParametersToMetaComponents', () => {
  test('maps header and body named parameters with parameter_name', ({ assert }) => {
    const components = mapNamedParametersToMetaComponents({
      schema: {
        headerNames: ['first_name'],
        bodyNames: ['order_id'],
        sendable: true,
        parameterFormat: 'named',
      },
      values: { first_name: 'Ada', order_id: '42' },
    })

    assert.deepEqual(components, [
      {
        type: 'header',
        parameters: [{ type: 'text', parameter_name: 'first_name', text: 'Ada' }],
      },
      {
        type: 'body',
        parameters: [{ type: 'text', parameter_name: 'order_id', text: '42' }],
      },
    ])
  })

  test('maps positional body parameters without parameter_name', ({ assert }) => {
    const components = mapNamedParametersToMetaComponents({
      schema: {
        headerNames: [],
        bodyNames: ['1', '2'],
        sendable: true,
        parameterFormat: 'positional',
      },
      values: { '1': 'Ada', '2': '42' },
    })

    assert.deepEqual(components, [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Ada' },
          { type: 'text', text: '42' },
        ],
      },
    ])
  })

  test('maps image header media and body params', ({ assert }) => {
    const components = mapNamedParametersToMetaComponents({
      schema: {
        headerNames: [],
        bodyNames: ['sku'],
        sendable: true,
        headerMediaType: 'image',
        parameterFormat: 'named',
      },
      values: { sku: 'A-1' },
      headerMedia: { link: 'https://cdn.example.com/a.jpg' },
    })

    assert.deepEqual(components, [
      {
        type: 'header',
        parameters: [{ type: 'image', image: { link: 'https://cdn.example.com/a.jpg' } }],
      },
      {
        type: 'body',
        parameters: [{ type: 'text', parameter_name: 'sku', text: 'A-1' }],
      },
    ])
  })

  test('maps document header with filename', ({ assert }) => {
    const components = mapNamedParametersToMetaComponents({
      schema: {
        headerNames: [],
        bodyNames: [],
        sendable: true,
        headerMediaType: 'document',
      },
      values: {},
      headerMedia: { link: 'https://cdn.example.com/inv.pdf', filename: 'invoice.pdf' },
    })

    assert.deepEqual(components, [
      {
        type: 'header',
        parameters: [
          {
            type: 'document',
            document: { link: 'https://cdn.example.com/inv.pdf', filename: 'invoice.pdf' },
          },
        ],
      },
    ])
  })

  test('requires header media for media-header schemas and rejects it otherwise', ({ assert }) => {
    assert.throws(
      () =>
        mapNamedParametersToMetaComponents({
          schema: {
            headerNames: [],
            bodyNames: [],
            sendable: true,
            headerMediaType: 'image',
          },
          values: {},
        }),
      TemplateParameterError,
      /Header media is required/
    )

    assert.throws(
      () =>
        mapNamedParametersToMetaComponents({
          schema: { headerNames: [], bodyNames: [], sendable: true },
          values: {},
          headerMedia: { link: 'https://cdn.example.com/a.jpg' },
        }),
      TemplateParameterError,
      /not allowed/
    )
  })

  test('rejects missing and unexpected keys', ({ assert }) => {
    const schema = {
      headerNames: [] as string[],
      bodyNames: ['name'],
      sendable: true,
      parameterFormat: 'named' as const,
    }

    assert.throws(
      () => mapNamedParametersToMetaComponents({ schema, values: {} }),
      TemplateParameterError,
      /Missing required/
    )

    assert.throws(
      () =>
        mapNamedParametersToMetaComponents({
          schema,
          values: { name: 'Ada', extra: 'x' },
        }),
      TemplateParameterError,
      /Unexpected/
    )
  })

  test('rejects empty string values', ({ assert }) => {
    assert.throws(
      () =>
        mapNamedParametersToMetaComponents({
          schema: {
            headerNames: [],
            bodyNames: ['1'],
            sendable: true,
            parameterFormat: 'positional',
          },
          values: { '1': '   ' },
        }),
      TemplateParameterError,
      /non-empty string/
    )
  })

  test('rejects non-sendable schema', ({ assert }) => {
    assert.throws(
      () =>
        mapNamedParametersToMetaComponents({
          schema: {
            headerNames: [],
            bodyNames: [],
            sendable: false,
            unsupportedReason: 'Video header templates are not supported',
          },
          values: {},
        }),
      TemplateParameterError,
      /Video/
    )
  })

  test('returns empty components when no variables', ({ assert }) => {
    const components = mapNamedParametersToMetaComponents({
      schema: { headerNames: [], bodyNames: [], sendable: true },
      values: {},
    })
    assert.deepEqual(components, [])
  })

  test('maps named URL button parameters with Meta index', ({ assert }) => {
    const components = mapNamedParametersToMetaComponents({
      schema: {
        headerNames: [],
        bodyNames: ['name'],
        urlButtons: [{ name: 'cta_url', index: 1 }],
        sendable: true,
        parameterFormat: 'named',
      },
      values: { name: 'Ada', cta_url: 'blue-shirt' },
    })

    assert.deepEqual(components, [
      {
        type: 'body',
        parameters: [{ type: 'text', parameter_name: 'name', text: 'Ada' }],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '1',
        parameters: [{ type: 'text', parameter_name: 'cta_url', text: 'blue-shirt' }],
      },
    ])
  })

  test('maps positional URL button parameters without parameter_name', ({ assert }) => {
    const components = mapNamedParametersToMetaComponents({
      schema: {
        headerNames: [],
        bodyNames: ['1'],
        urlButtons: [{ name: '2', index: 0 }],
        sendable: true,
        parameterFormat: 'positional',
      },
      values: { '1': 'Ada', '2': 'blue-shirt' },
    })

    assert.deepEqual(components, [
      {
        type: 'body',
        parameters: [{ type: 'text', text: 'Ada' }],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: 'blue-shirt' }],
      },
    ])
  })
})

test.group('pickRequiredParameterValues', () => {
  test('picks required keys and ignores extras', ({ assert }) => {
    const picked = pickRequiredParameterValues({
      schema: {
        headerNames: ['first_name'],
        bodyNames: ['order_id'],
        sendable: true,
      },
      values: { first_name: 'Ada', order_id: '42', extra: 'ignored' },
    })

    assert.deepEqual(picked, { first_name: 'Ada', order_id: '42' })
  })

  test('returns empty object when the template has no variables', ({ assert }) => {
    const picked = pickRequiredParameterValues({
      schema: { headerNames: [], bodyNames: [], sendable: true },
      values: { extra: 'ignored' },
    })
    assert.deepEqual(picked, {})
  })

  test('rejects missing or empty required values', ({ assert }) => {
    const schema = {
      headerNames: [] as string[],
      bodyNames: ['name'],
      sendable: true,
    }

    assert.throws(
      () => pickRequiredParameterValues({ schema, values: {} }),
      TemplateParameterError,
      /Missing required/
    )

    assert.throws(
      () => pickRequiredParameterValues({ schema, values: { name: '   ' } }),
      TemplateParameterError,
      /non-empty string/
    )
  })

  test('rejects non-sendable schema', ({ assert }) => {
    assert.throws(
      () =>
        pickRequiredParameterValues({
          schema: {
            headerNames: [],
            bodyNames: [],
            sendable: false,
            unsupportedReason: 'Video header templates are not supported',
          },
          values: {},
        }),
      TemplateParameterError,
      /Video/
    )
  })
})

test.group('parseParameterSchema', () => {
  test('narrows stored jsonb including headerMediaType and parameterFormat', ({ assert }) => {
    assert.deepEqual(
      parseParameterSchema({
        headerNames: ['a'],
        bodyNames: ['b'],
        sendable: true,
        parameterFormat: 'named',
      }),
      {
        headerNames: ['a'],
        bodyNames: ['b'],
        sendable: true,
        unsupportedReason: undefined,
        headerMediaType: undefined,
        parameterFormat: 'named',
      }
    )

    assert.deepEqual(
      parseParameterSchema({
        headerNames: [],
        bodyNames: [],
        sendable: true,
        headerMediaType: 'IMAGE',
      }),
      {
        headerNames: [],
        bodyNames: [],
        sendable: true,
        unsupportedReason: undefined,
        headerMediaType: 'image',
      }
    )

    assert.deepEqual(
      parseParameterSchema({
        headerNames: [],
        bodyNames: [],
        urlButtons: [{ name: 'cta_url', index: 0 }],
        sendable: true,
      }),
      {
        headerNames: [],
        bodyNames: [],
        urlButtons: [{ name: 'cta_url', index: 0 }],
        sendable: true,
        unsupportedReason: undefined,
        headerMediaType: undefined,
        parameterFormat: 'named',
      }
    )
  })

  test('infers positional format from all-numeric names when parameterFormat missing', ({
    assert,
  }) => {
    const schema = parseParameterSchema({
      headerNames: [],
      bodyNames: ['1', '2'],
      sendable: true,
    })

    assert.equal(schema.parameterFormat, 'positional')
    assert.deepEqual(schema.bodyNames, ['1', '2'])
  })

  test('invalid input is non-sendable', ({ assert }) => {
    assert.isFalse(parseParameterSchema(null).sendable)
    assert.isFalse(parseParameterSchema('x').sendable)
  })
})
