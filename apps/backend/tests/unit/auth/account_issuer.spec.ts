import { test } from '@japa/runner'
import {
  CREDENTIAL_ACCOUNT_ISSUER,
  GOOGLE_ACCOUNT_ISSUER,
  accountIssuerForProvider,
} from '#lib/account_issuer'

test.group('accountIssuerForProvider', () => {
  test('maps credential and google to Better Auth namespaces', ({ assert }) => {
    assert.equal(accountIssuerForProvider('credential'), CREDENTIAL_ACCOUNT_ISSUER)
    assert.equal(accountIssuerForProvider('google'), GOOGLE_ACCOUNT_ISSUER)
    assert.equal(accountIssuerForProvider('github'), 'local:oauth:github')
  })
})
