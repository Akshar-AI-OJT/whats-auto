import { test } from '@japa/runner'
import { decryptIntegrationSecret, encryptIntegrationSecret } from '#lib/integrations/secret_crypto'

test.group('integration secret crypto', () => {
  test('round-trips a store secret', ({ assert }) => {
    const plain = 'shpat_test_store_token'
    const ciphertext = encryptIntegrationSecret(plain)

    assert.notEqual(ciphertext, plain)
    assert.equal(decryptIntegrationSecret(ciphertext), plain)
  })

  test('throws when ciphertext is not a secret', ({ assert }) => {
    assert.throws(() => decryptIntegrationSecret('not-a-valid-payload'))
  })
})
