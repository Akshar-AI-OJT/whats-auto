import { test } from '@japa/runner'
import { HttpMetaGraphClient, MetaGraphApiError } from '#lib/meta_whatsapp/graph_client'

test.group('HttpMetaGraphClient', () => {
  test('exchangeEmbeddedSignupCode returns access token', async ({ assert }) => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ access_token: 'tok_abc', token_type: 'bearer' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    const client = new HttpMetaGraphClient({
      appId: 'app',
      appSecret: 'secret',
      graphVersion: 'v25.0',
      fetchImpl: fetchImpl as typeof fetch,
    })

    const result = await client.exchangeEmbeddedSignupCode('code-1')
    assert.equal(result.accessToken, 'tok_abc')
  })

  test('requestJson maps Meta error body to MetaGraphApiError', async ({ assert }) => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: { message: 'Invalid OAuth access token', code: 190 },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )

    const client = new HttpMetaGraphClient({
      appId: 'app',
      appSecret: 'secret',
      graphVersion: 'v25.0',
      fetchImpl: fetchImpl as typeof fetch,
    })

    try {
      await client.subscribeAppToWaba({ wabaId: '1', accessToken: 'bad' })
      assert.fail('expected MetaGraphApiError')
    } catch (error) {
      assert.instanceOf(error, MetaGraphApiError)
      assert.equal((error as MetaGraphApiError).message, 'Invalid OAuth access token')
      assert.equal((error as MetaGraphApiError).operation, 'subscribeApps')
    }
  })

  test('sendTemplateMessage posts Cloud API shape', async ({ assert }) => {
    let seenUrl = ''
    let seenBody: Record<string, unknown> = {}

    const fetchImpl: typeof fetch = async (input, init) => {
      seenUrl = String(input)
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const client = new HttpMetaGraphClient({
      appId: 'app',
      appSecret: 'secret',
      graphVersion: 'v25.0',
      fetchImpl,
    })

    const result = await client.sendTemplateMessage({
      phoneNumberId: 'pn-1',
      accessToken: 'tok',
      to: '15551234567',
      templateName: 'hello_world',
      languageCode: 'en_US',
    })

    assert.include(seenUrl, '/v25.0/pn-1/messages')
    assert.equal(seenBody.messaging_product, 'whatsapp')
    assert.equal(seenBody.type, 'template')
    const template = seenBody.template as Record<string, unknown>
    assert.isUndefined(template.components)
    assert.equal(result.messageId, 'wamid.1')
  })

  test('sendTemplateMessage includes components when provided', async ({ assert }) => {
    let seenBody: Record<string, unknown> = {}

    const fetchImpl: typeof fetch = async (_input, init) => {
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.2' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const client = new HttpMetaGraphClient({
      appId: 'app',
      appSecret: 'secret',
      graphVersion: 'v25.0',
      fetchImpl,
    })

    await client.sendTemplateMessage({
      phoneNumberId: 'pn-1',
      accessToken: 'tok',
      to: '15551234567',
      templateName: 'order_update',
      languageCode: 'en',
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', parameter_name: 'name', text: 'Ada' }],
        },
      ],
    })

    const template = seenBody.template as Record<string, unknown>
    assert.deepEqual(template.components, [
      {
        type: 'body',
        parameters: [{ type: 'text', parameter_name: 'name', text: 'Ada' }],
      },
    ])
  })

  test('sendTextMessage posts Cloud API text shape', async ({ assert }) => {
    let seenBody: Record<string, unknown> = {}

    const fetchImpl: typeof fetch = async (_input, init) => {
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.text' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const client = new HttpMetaGraphClient({
      appId: 'app',
      appSecret: 'secret',
      graphVersion: 'v25.0',
      fetchImpl,
    })

    const result = await client.sendTextMessage({
      phoneNumberId: 'pn-1',
      accessToken: 'tok',
      to: '15551234567',
      text: 'Hello there',
    })

    assert.equal(seenBody.type, 'text')
    assert.deepEqual(seenBody.text, { preview_url: false, body: 'Hello there' })
    assert.equal(result.messageId, 'wamid.text')
  })

  test('sendTextMessage posts Cloud API shape', async ({ assert }) => {
    let seenBody: Record<string, unknown> = {}

    const fetchImpl: typeof fetch = async (_input, init) => {
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.text' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const client = new HttpMetaGraphClient({
      appId: 'app',
      appSecret: 'secret',
      graphVersion: 'v25.0',
      fetchImpl,
    })

    const result = await client.sendTextMessage({
      phoneNumberId: 'pn-1',
      accessToken: 'tok',
      to: '15551234567',
      text: 'Hello!',
    })

    assert.equal(seenBody.type, 'text')
    assert.deepEqual(seenBody.text, { preview_url: false, body: 'Hello!' })
    assert.equal(result.messageId, 'wamid.text')
  })

  test('sendMediaMessage posts Cloud API shape', async ({ assert }) => {
    let seenBody: Record<string, unknown> = {}

    const fetchImpl: typeof fetch = async (_input, init) => {
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.img' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const client = new HttpMetaGraphClient({
      appId: 'app',
      appSecret: 'secret',
      graphVersion: 'v25.0',
      fetchImpl,
    })

    const result = await client.sendMediaMessage({
      phoneNumberId: 'pn-1',
      accessToken: 'tok',
      to: '15551234567',
      type: 'image',
      link: 'https://example.com/photo.jpg',
      caption: 'Check this',
    })

    assert.equal(seenBody.type, 'image')
    assert.deepEqual(seenBody.image, {
      link: 'https://example.com/photo.jpg',
      caption: 'Check this',
    })
    assert.equal(result.messageId, 'wamid.img')
  })

  test('createResumableUploadSession posts to app uploads endpoint', async ({ assert }) => {
    let seenUrl = ''
    let seenMethod = ''

    const fetchImpl: typeof fetch = async (input, init) => {
      seenUrl = String(input)
      seenMethod = String(init?.method)
      return new Response(JSON.stringify({ id: 'upload:session-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const client = new HttpMetaGraphClient({
      appId: 'app-123',
      appSecret: 'secret',
      graphVersion: 'v25.0',
      fetchImpl,
    })

    const result = await client.createResumableUploadSession({
      accessToken: 'tok',
      fileLength: 100,
      fileType: 'image/png',
      fileName: 'sample.png',
    })

    assert.include(seenUrl, '/v25.0/app-123/uploads?')
    assert.include(seenUrl, 'file_length=100')
    assert.include(seenUrl, 'file_type=image%2Fpng')
    assert.equal(seenMethod, 'POST')
    assert.equal(result.uploadSessionId, 'upload:session-1')
  })

  test('uploadResumableFile posts binary and returns handle', async ({ assert }) => {
    let seenUrl = ''
    let seenHeaders: HeadersInit | undefined
    let seenBody: BodyInit | null | undefined

    const fetchImpl: typeof fetch = async (input, init) => {
      seenUrl = String(input)
      seenHeaders = init?.headers
      seenBody = init?.body
      return new Response(JSON.stringify({ h: '4::handle-abc' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const client = new HttpMetaGraphClient({
      appId: 'app',
      appSecret: 'secret',
      graphVersion: 'v25.0',
      fetchImpl,
    })

    const bytes = new Uint8Array([1, 2, 3, 4])
    const result = await client.uploadResumableFile({
      accessToken: 'tok',
      uploadSessionId: 'upload:session-1',
      fileBytes: bytes,
    })

    assert.include(seenUrl, '/v25.0/upload:session-1')
    const headers = new Headers(seenHeaders)
    assert.equal(headers.get('Authorization'), 'OAuth tok')
    assert.equal(headers.get('file_offset'), '0')
    assert.equal(seenBody, bytes)
    assert.equal(result.handle, '4::handle-abc')
  })

  test('createMessageTemplate includes parameter_format and components', async ({ assert }) => {
    let seenBody: Record<string, unknown> = {}

    const fetchImpl: typeof fetch = async (_input, init) => {
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ id: 'tmpl-1', status: 'PENDING' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const client = new HttpMetaGraphClient({
      appId: 'app',
      appSecret: 'secret',
      graphVersion: 'v25.0',
      fetchImpl,
    })

    await client.createMessageTemplate({
      wabaId: 'waba-1',
      accessToken: 'tok',
      name: 'promo_image',
      category: 'MARKETING',
      language: 'en_US',
      parameterFormat: 'POSITIONAL',
      components: [
        {
          type: 'HEADER',
          format: 'IMAGE',
          example: { header_handle: ['4::handle'] },
        },
        {
          type: 'BODY',
          text: 'Hello {{1}}',
          example: { body_text: [['Ada']] },
        },
      ],
    })

    assert.equal(seenBody.parameter_format, 'POSITIONAL')
    assert.equal(seenBody.name, 'promo_image')
    const components = seenBody.components as Array<Record<string, unknown>>
    assert.equal(components[0].format, 'IMAGE')
    assert.deepEqual((components[0].example as Record<string, unknown>).header_handle, [
      '4::handle',
    ])
  })
})
