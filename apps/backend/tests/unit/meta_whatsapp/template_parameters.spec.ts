import { test } from '@japa/runner'
import {
  deriveParameterSchema,
  mapNamedParametersToMetaComponents,
  parseParameterSchema,
  pickRequiredParameterValues,
  TemplateParameterError,
} from '#lib/meta_whatsapp/template_parameters'

test.group('deriveParameterSchema', () => {
  test('extracts named body and text-header variables', ({ assert }) => {
    const schema = deriveParameterSchema({
      headerType: 'text',
      headerContent: 'Hi {{first_name}}',
      bodyText: 'Your order {{order_id}} ships today.',
    })

    assert.isTrue(schema.sendable)
    assert.deepEqual(schema.headerNames, ['first_name'])
    assert.deepEqual(schema.bodyNames, ['order_id'])
    assert.isUndefined(schema.headerMediaType)
  })

  test('rejects numbered placeholders', ({ assert }) => {
    const schema = deriveParameterSchema({
      bodyText: 'Hello {{1}}, your code is {{2}}',
    })

    assert.isFalse(schema.sendable)
    assert.include(schema.unsupportedReason ?? '', 'Numbered')
  })

  test('marks image media headers sendable with headerMediaType and body names', ({ assert }) => {
    const schema = deriveParameterSchema({
      headerType: 'image',
      headerContent: 'https://example.com/x.jpg',
      bodyText: 'See {{product}}',
    })

    assert.isTrue(schema.sendable)
    assert.equal(schema.headerMediaType, 'image')
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

  test('media header with numbered body is still rejected', ({ assert }) => {
    const schema = deriveParameterSchema({
      headerType: 'document',
      bodyText: 'Invoice {{1}}',
    })

    assert.isFalse(schema.sendable)
    assert.include(schema.unsupportedReason ?? '', 'Numbered')
  })

  test('rejects dynamic button variables', ({ assert }) => {
    const schema = deriveParameterSchema({
      bodyText: 'Tap below',
      buttons: [{ type: 'URL', text: 'Open', url: 'https://x.com/{{token}}' }],
    })

    assert.isFalse(schema.sendable)
    assert.include(schema.unsupportedReason ?? '', 'button')
  })

  test('parameterless body is sendable', ({ assert }) => {
    const schema = deriveParameterSchema({
      headerType: 'none',
      bodyText: 'Hello world',
    })

    assert.isTrue(schema.sendable)
    assert.deepEqual(schema.headerNames, [])
    assert.deepEqual(schema.bodyNames, [])
  })
})

test.group('mapNamedParametersToMetaComponents', () => {
  test('maps header and body named parameters', ({ assert }) => {
    const components = mapNamedParametersToMetaComponents({
      schema: {
        headerNames: ['first_name'],
        bodyNames: ['order_id'],
        sendable: true,
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

  test('maps image header media and body params', ({ assert }) => {
    const components = mapNamedParametersToMetaComponents({
      schema: {
        headerNames: [],
        bodyNames: ['sku'],
        sendable: true,
        headerMediaType: 'image',
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

  test('rejects non-sendable schema', ({ assert }) => {
    assert.throws(
      () =>
        mapNamedParametersToMetaComponents({
          schema: {
            headerNames: [],
            bodyNames: [],
            sendable: false,
            unsupportedReason: 'Numbered placeholders',
          },
          values: {},
        }),
      TemplateParameterError,
      /Numbered/
    )
  })

  test('returns empty components when no variables', ({ assert }) => {
    const components = mapNamedParametersToMetaComponents({
      schema: { headerNames: [], bodyNames: [], sendable: true },
      values: {},
    })
    assert.deepEqual(components, [])
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
            unsupportedReason: 'Numbered placeholders like {{1}} are not supported',
          },
          values: {},
        }),
      TemplateParameterError,
      /Numbered placeholders/
    )
  })
})

test.group('parseParameterSchema', () => {
  test('narrows stored jsonb including headerMediaType', ({ assert }) => {
    assert.deepEqual(
      parseParameterSchema({
        headerNames: ['a'],
        bodyNames: ['b'],
        sendable: true,
      }),
      {
        headerNames: ['a'],
        bodyNames: ['b'],
        sendable: true,
        unsupportedReason: undefined,
        headerMediaType: undefined,
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
  })

  test('invalid input is non-sendable', ({ assert }) => {
    assert.isFalse(parseParameterSchema(null).sendable)
    assert.isFalse(parseParameterSchema('x').sendable)
  })
})
