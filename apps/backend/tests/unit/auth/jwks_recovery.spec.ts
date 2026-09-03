import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { symmetricEncrypt } from 'better-auth/crypto'
import { isJwkPrivateKeyReadable, selectDecryptableJwks } from '#lib/jwks_recovery'

const TEST_SECRET = 'jwks-recovery-test-secret-32-chars!!'

test.group('JWKS recovery', () => {
  test('accepts a private key encrypted with the current secret', async ({ assert }) => {
    const ciphertext = await symmetricEncrypt({
      key: TEST_SECRET,
      data: JSON.stringify({ kty: 'OKP', crv: 'Ed25519', d: 'x', x: 'y' }),
    })
    const stored = JSON.stringify(ciphertext)

    assert.isTrue(await isJwkPrivateKeyReadable(TEST_SECRET, stored))
  })

  test('accepts plaintext JWK private keys', async ({ assert }) => {
    assert.isTrue(
      await isJwkPrivateKeyReadable(
        TEST_SECRET,
        JSON.stringify({ kty: 'OKP', crv: 'Ed25519', d: 'x', x: 'y' })
      )
    )
  })

  test('rejects malformed or foreign-secret private keys', async ({ assert }) => {
    assert.isFalse(await isJwkPrivateKeyReadable(TEST_SECRET, 'not-json'))
    assert.isFalse(await isJwkPrivateKeyReadable(TEST_SECRET, JSON.stringify('garbage')))

    const other = await symmetricEncrypt({
      key: 'a-different-secret-that-is-32chars!',
      data: JSON.stringify({ kty: 'OKP' }),
    })
    assert.isFalse(await isJwkPrivateKeyReadable(TEST_SECRET, JSON.stringify(other)))
  })

  test('partitions usable keys from stale ids', async ({ assert }) => {
    const goodId = randomUUID()
    const staleId = randomUUID()
    const ciphertext = await symmetricEncrypt({
      key: TEST_SECRET,
      data: JSON.stringify({ kty: 'OKP' }),
    })

    const { usable, staleIds } = await selectDecryptableJwks(TEST_SECRET, [
      { id: goodId, privateKey: JSON.stringify(ciphertext) },
      { id: staleId, privateKey: 'not-a-key' },
    ])

    assert.deepEqual(
      usable.map((row) => row.id),
      [goodId]
    )
    assert.deepEqual(staleIds, [staleId])
  })
})
