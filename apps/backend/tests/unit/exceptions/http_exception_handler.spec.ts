import { test } from '@japa/runner'
import HttpExceptionHandler from '#exceptions/handler'

test.group('HttpExceptionHandler unique violation sanitizer', () => {
  test('maps bare 23505 to 409 E_DUPLICATE_RESOURCE without SQL leak', async ({ assert }) => {
    const handler = new HttpExceptionHandler()
    let status: number | undefined
    let body: Record<string, unknown> | undefined

    const ctx = {
      response: {
        status(code: number) {
          status = code
          return {
            send(payload: Record<string, unknown>) {
              body = payload
              return payload
            },
          }
        },
      },
    }

    await handler.handle(
      {
        code: '23505',
        detail: 'Key (slug)=(acme) already exists.',
        message: 'insert into "organizations" ("slug") values ($1) - duplicate key',
      },
      ctx as never
    )

    assert.equal(status, 409)
    assert.deepEqual(body, {
      error: 'A record with this slug already exists.',
      code: 'E_DUPLICATE_RESOURCE',
      field: 'slug',
    })
    assert.notInclude(JSON.stringify(body), 'insert into')
  })

  test('maps Bouncer 403 E_AUTHORIZATION_FAILURE to PERMISSION_DENIED', async ({ assert }) => {
    const handler = new HttpExceptionHandler()
    let status: number | undefined
    let body: Record<string, unknown> | undefined

    const ctx = {
      response: {
        status(code: number) {
          status = code
          return {
            send(payload: Record<string, unknown>) {
              body = payload
              return payload
            },
          }
        },
      },
    }

    await handler.handle(
      {
        status: 403,
        code: 'E_AUTHORIZATION_FAILURE',
        message: 'Permission denied: media:upload',
      },
      ctx as never
    )

    assert.equal(status, 403)
    assert.deepEqual(body, {
      error: 'Permission denied: media:upload',
      code: 'PERMISSION_DENIED',
    })
  })

  test('maps nested cause 23505', async ({ assert }) => {
    const handler = new HttpExceptionHandler()
    let status: number | undefined
    let body: Record<string, unknown> | undefined

    const ctx = {
      response: {
        status(code: number) {
          status = code
          return {
            send(payload: Record<string, unknown>) {
              body = payload
              return payload
            },
          }
        },
      },
    }

    await handler.handle(
      {
        message: 'Knex wrapper',
        cause: {
          code: '23505',
          detail: 'Key (email)=(ops@acme.com) already exists.',
        },
      },
      ctx as never
    )

    assert.equal(status, 409)
    assert.equal(body?.code, 'E_DUPLICATE_RESOURCE')
    assert.equal(body?.field, 'email')
  })
})
