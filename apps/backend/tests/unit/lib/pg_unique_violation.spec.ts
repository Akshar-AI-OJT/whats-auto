import { test } from '@japa/runner'
import {
  extractPostgresError,
  extractUniqueViolationField,
  isPostgresUniqueViolation,
} from '#lib/pg_unique_violation'

test.group('isPostgresUniqueViolation', () => {
  test('returns true for bare 23505', ({ assert }) => {
    assert.isTrue(isPostgresUniqueViolation({ code: '23505' }))
  })

  test('returns false for other codes', ({ assert }) => {
    assert.isFalse(isPostgresUniqueViolation({ code: '23503' }))
    assert.isFalse(isPostgresUniqueViolation(new Error('boom')))
    assert.isFalse(isPostgresUniqueViolation(null))
  })

  test('walks nested cause and original', ({ assert }) => {
    assert.isTrue(
      isPostgresUniqueViolation({
        message: 'wrapper',
        cause: { code: '23505', constraint: 'organizations_slug_unique' },
      })
    )
    assert.isTrue(
      isPostgresUniqueViolation({
        message: 'wrapper',
        original: { code: '23505' },
      })
    )
  })

  test('matches optional constraint name', ({ assert }) => {
    const error = {
      code: '23505',
      constraint: 'organizations_slug_unique',
      detail: 'Key (slug)=(acme) already exists.',
    }
    assert.isTrue(isPostgresUniqueViolation(error, 'organizations_slug_unique'))
    assert.isFalse(isPostgresUniqueViolation(error, 'other_unique'))
  })

  test('matches quoted postgres index names', ({ assert }) => {
    assert.isTrue(
      isPostgresUniqueViolation(
        { code: '23505', constraint: '"plans_active_logical_identity_unique"' },
        'plans_active_logical_identity_unique'
      )
    )
  })

  test('matches constraint name in detail when constraint field missing', ({ assert }) => {
    const error = {
      code: '23505',
      detail: 'Key (slug)=(acme) already exists. Constraint organizations_slug_unique',
    }
    assert.isTrue(isPostgresUniqueViolation(error, 'organizations_slug_unique'))
  })
})

test.group('extractUniqueViolationField', () => {
  test('parses Key (field)= detail', ({ assert }) => {
    assert.equal(extractUniqueViolationField('Key (slug)=(acme) already exists.'), 'slug')
    assert.equal(
      extractUniqueViolationField('Key (organizationId, name)=(…, vip) already exists.'),
      'organizationId, name'
    )
    assert.isNull(extractUniqueViolationField(undefined))
    assert.isNull(extractUniqueViolationField('no match'))
  })
})

test.group('extractPostgresError', () => {
  test('returns nested postgres node', ({ assert }) => {
    const nested = { code: '23505', detail: 'Key (slug)=(x) already exists.' }
    assert.deepEqual(extractPostgresError({ cause: nested }), nested)
  })

  test('ignores domain exception codes', ({ assert }) => {
    assert.isNull(
      extractPostgresError({
        code: 'E_ORG_SLUG_ALREADY_EXISTS',
        message: 'Organization slug already in use',
      })
    )
  })
})
