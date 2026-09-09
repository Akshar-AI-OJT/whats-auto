import { test } from '@japa/runner'
import {
  assertContactImportStorageKey,
  buildContactImportStorageKey,
  sanitizeContactImportFileName,
  uniqueContactImportStorageKey,
} from '#lib/organization_storage_path'

const orgId = '11111111-1111-4111-8111-111111111111'
const otherOrgId = '22222222-2222-4222-8222-222222222222'

test.group('organization storage path', () => {
  test('builds the contact import key from the tenant organization id', ({ assert }) => {
    assert.equal(
      buildContactImportStorageKey(orgId, 'customer_contacts.csv'),
      `organizations/${orgId}/imports/contacts/customer_contacts.csv`
    )
    assert.equal(
      buildContactImportStorageKey(orgId, 'contacts.csv'),
      `organizations/${orgId}/imports/contacts/contacts.csv`
    )
  })

  test('sanitizes traversal and unsafe filenames', ({ assert }) => {
    assert.equal(sanitizeContactImportFileName('../etc/passwd.csv'), 'passwd.csv')
    assert.equal(sanitizeContactImportFileName('..\\..\\secret.csv'), 'secret.csv')
    assert.equal(sanitizeContactImportFileName('foo/bar/baz.csv'), 'baz.csv')
    assert.equal(sanitizeContactImportFileName('my contacts.csv'), 'my_contacts.csv')
    assert.equal(sanitizeContactImportFileName('CONTACTS.CSV'), 'CONTACTS.csv')
    assert.equal(sanitizeContactImportFileName(''), 'contacts.csv')
    assert.equal(sanitizeContactImportFileName('...'), 'contacts.csv')
    assert.equal(sanitizeContactImportFileName('.csv'), 'contacts.csv')
    assert.equal(
      buildContactImportStorageKey(orgId, '../../etc/passwd.csv'),
      `organizations/${orgId}/imports/contacts/passwd.csv`
    )
  })

  test('appends a unique suffix without leaving the contacts folder', ({ assert }) => {
    const key = uniqueContactImportStorageKey(orgId, 'contacts.csv', orgId)
    assert.equal(key, `organizations/${orgId}/imports/contacts/contacts-${orgId}.csv`)
  })

  test('rejects keys that belong to another organization', ({ assert }) => {
    const key = buildContactImportStorageKey(orgId, 'contacts.csv')
    assert.equal(assertContactImportStorageKey(orgId, key), key)

    try {
      assertContactImportStorageKey(otherOrgId, key)
      assert.fail('expected cross-organization key to be rejected')
    } catch (error) {
      assert.match((error as Error).message, /outside the organization storage path/)
    }

    try {
      assertContactImportStorageKey(orgId, `organizations/${orgId}/media-library/photo.jpg`)
      assert.fail('expected sibling folder to be rejected')
    } catch (error) {
      assert.match((error as Error).message, /outside the organization storage path/)
    }

    try {
      assertContactImportStorageKey(
        orgId,
        `organizations/${orgId}/imports/contacts/../profile/x.csv`
      )
      assert.fail('expected traversal key to be rejected')
    } catch (error) {
      assert.match((error as Error).message, /invalid|outside/)
    }
  })

  test('rejects a client-supplied organization id that is not a uuid', ({ assert }) => {
    try {
      buildContactImportStorageKey('../other', 'contacts.csv')
      assert.fail('expected invalid organization id')
    } catch (error) {
      assert.match((error as Error).message, /Invalid organization id/)
    }
  })
})
