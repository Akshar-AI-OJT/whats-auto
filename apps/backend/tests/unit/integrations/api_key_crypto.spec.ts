import { createHash } from 'node:crypto'
import { test } from '@japa/runner'
import { generateApiKey, hashApiKey } from '#lib/integrations/api_key_crypto'

const TOKEN_PATTERN = /^wta_live_[0-9a-f]{8}_[0-9a-f]{32}$/

test.group('api key crypto', () => {
  test('generates wta_live prefix, 8-hex id, and 32-hex secret', ({ assert }) => {
    const generated = generateApiKey()

    assert.match(generated.rawToken, TOKEN_PATTERN)
    assert.equal(generated.keyPrefix, generated.rawToken.slice(0, 'wta_live_'.length + 8))
    assert.equal(generated.keyHash, hashApiKey(generated.rawToken))
  })

  test('hashes the full token with SHA-256 hex', ({ assert }) => {
    const token = 'wta_live_aaaaaaaa_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const expected = createHash('sha256').update(token).digest('hex')

    assert.equal(hashApiKey(token), expected)
    assert.equal(expected.length, 64)
  })

  test('generates unique tokens', ({ assert }) => {
    const first = generateApiKey()
    const second = generateApiKey()

    assert.notEqual(first.rawToken, second.rawToken)
    assert.notEqual(first.keyHash, second.keyHash)
  })
})
