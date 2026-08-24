import { test } from '@japa/runner'
import type ContactException from '#exceptions/contact_exception'
import { mappedCell, parseContactCsv, resolvePhoneHeader } from '#lib/contact_csv'

test.group('parseContactCsv', () => {
  test('parses international numbers and quoted commas', ({ assert }) => {
    const csv = [
      'name,phone',
      'Rahul,+919876543210',
      '"Rah, Jr",+14155552671',
      'David,+447911123456',
    ].join('\n')

    const parsed = parseContactCsv(csv)
    assert.deepEqual(parsed.headers, ['name', 'phone'])
    assert.lengthOf(parsed.rows, 3)
    assert.equal(parsed.rows[0]?.phone, '+919876543210')
    assert.equal(parsed.rows[1]?.name, 'Rah, Jr')
    assert.equal(parsed.rows[2]?.phone, '+447911123456')
  })

  test('maps alternate phone headers', ({ assert }) => {
    const csv = 'Full Name,Mobile Number\nRahul,9876543210\n'
    const parsed = parseContactCsv(csv)
    const phoneHeader = resolvePhoneHeader(parsed.headers, { phone: 'Mobile Number' })
    assert.equal(phoneHeader, 'Mobile Number')
    const mapping = { phone: 'Mobile Number', name: 'Full Name' }
    assert.equal(mappedCell(parsed.rows[0] ?? {}, parsed.headers, mapping, 'phone'), '9876543210')
    assert.equal(mappedCell(parsed.rows[0] ?? {}, parsed.headers, mapping, 'name'), 'Rahul')
  })

  test('rejects empty, missing phone column, and malformed CSV', ({ assert }) => {
    try {
      parseContactCsv('   ')
      assert.fail('expected empty csv')
    } catch (error) {
      assert.equal((error as ContactException).code, 'E_CONTACT_IMPORT_EMPTY')
    }

    try {
      const parsed = parseContactCsv('name,email\nAda,ada@example.com\n')
      resolvePhoneHeader(parsed.headers, {})
      assert.fail('expected missing phone column')
    } catch (error) {
      assert.equal((error as ContactException).code, 'E_CONTACT_IMPORT_MISSING_PHONE_COLUMN')
    }

    try {
      resolvePhoneHeader(['Full Name', 'Email'], { phone: 'Mobile Number' })
      assert.fail('expected missing mapped phone column')
    } catch (error) {
      assert.equal((error as ContactException).code, 'E_CONTACT_IMPORT_MISSING_PHONE_COLUMN')
    }

    try {
      parseContactCsv('name,phone\n"unterminated')
      assert.fail('expected malformed csv')
    } catch (error) {
      assert.equal((error as ContactException).code, 'E_CONTACT_IMPORT_MALFORMED')
    }
  })
})
