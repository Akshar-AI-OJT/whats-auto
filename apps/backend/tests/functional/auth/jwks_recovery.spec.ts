import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { auth } from '#lib/auth'
import { ensureDemoFixtures } from '#tests/helpers/ensure_demo_fixtures'

test.group('JWKS decrypt recovery', (group) => {
  group.setup(async () => {
    await ensureDemoFixtures()
  })

  test('signJWT replaces JWKS rows encrypted under a different secret', async ({ assert }) => {
    await db.from('jwks').delete()
    await db.table('jwks').insert({
      publicKey: JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: 'YQ' }),
      privateKey: 'not-a-decryptable-private-key',
      alg: 'EdDSA',
      crv: 'Ed25519',
    })

    const signed = await auth.api.signJWT({
      body: { payload: { sub: 'jwks-recovery', token_use: 'access' } },
    })
    const token = (signed as { token?: string } | null)?.token
    assert.isString(token)
    assert.isAbove(token!.length, 20)

    const stale = await db.from('jwks').where('privateKey', 'not-a-decryptable-private-key')
    assert.lengthOf(stale, 0)

    const fresh = await db.from('jwks').select('id')
    assert.isAbove(fresh.length, 0)
  })
})
