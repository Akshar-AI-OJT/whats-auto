import { test } from '@japa/runner'
import { normalizeMailSecret } from '#lib/mail/normalize_mail_secret'

test.group('normalizeMailSecret', () => {
  test('strips interior whitespace from Gmail-style app passwords', ({ assert }) => {
    assert.equal(normalizeMailSecret('abcd efgh ijkl mnop'), 'abcdefghijklmnop')
  })

  test('trims leading and trailing whitespace', ({ assert }) => {
    assert.equal(normalizeMailSecret('  secret-key  '), 'secret-key')
  })

  test('returns null for empty or whitespace-only input', ({ assert }) => {
    assert.isNull(normalizeMailSecret(''))
    assert.isNull(normalizeMailSecret('   '))
    assert.isNull(normalizeMailSecret(null))
    assert.isNull(normalizeMailSecret(undefined))
  })
})
