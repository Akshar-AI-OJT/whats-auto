import { test } from '@japa/runner'
import env from '#start/env'

test.group('CORS', () => {
  test('preflight from CORS_ORIGIN allows credentials', async ({ client, assert }) => {
    const origin = env.get('CORS_ORIGIN').replace(/\/$/, '')

    const response = await client
      .options('/api/auth/get-session')
      .header('Origin', origin)
      .header('Access-Control-Request-Method', 'GET')

    assert.isTrue([200, 204].includes(response.status()))
    assert.equal(response.header('access-control-allow-origin'), origin)
    assert.equal(response.header('access-control-allow-credentials'), 'true')
  })
})
