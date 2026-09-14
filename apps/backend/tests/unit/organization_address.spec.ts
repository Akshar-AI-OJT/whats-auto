import { test } from '@japa/runner'
import {
  formatOrganizationAddress,
  normalizeOrganizationAddress,
  parseOrganizationAddress,
} from '#lib/organization_address'

test.group('Organization address helpers', () => {
  test('normalizes legacy free-text address into jsonb shape without country', ({ assert }) => {
    assert.deepEqual(normalizeOrganizationAddress('221B Baker Street, Mumbai', 'IN'), {
      addressLine1: '221B Baker Street, Mumbai',
      addressLine2: null,
      city: '',
      state: '',
      postalCode: '',
    })
  })

  test('strips country from structured address input', ({ assert }) => {
    assert.deepEqual(
      normalizeOrganizationAddress({
        addressLine1: '12 MG Road',
        addressLine2: null,
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'IN',
      } as never),
      {
        addressLine1: '12 MG Road',
        addressLine2: null,
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
      }
    )
  })

  test('formats structured address with separate country for invoices', ({ assert }) => {
    assert.equal(
      formatOrganizationAddress(
        {
          addressLine1: '12 MG Road',
          addressLine2: null,
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560001',
        },
        'IN'
      ),
      '12 MG Road, Bengaluru, Karnataka, 560001, IN'
    )
  })

  test('parses migrated jsonb and ignores legacy country property', ({ assert }) => {
    assert.deepEqual(
      parseOrganizationAddress({
        addressLine1: 'Old free text',
        addressLine2: null,
        city: null,
        state: null,
        postalCode: null,
        country: 'IN',
      }),
      {
        addressLine1: 'Old free text',
        addressLine2: null,
        city: '',
        state: '',
        postalCode: '',
      }
    )
  })
})
