import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import ContactException from '#exceptions/contact_exception'
import { normalizeContactPhone, normalizeWhatsappWaId } from '#lib/contact_phone'

function assertInvalid(assert: Assert, fn: () => void) {
  try {
    fn()
    assert.fail('expected invalid phone')
  } catch (error) {
    assert.instanceOf(error, ContactException)
    assert.equal((error as ContactException).code, 'E_CONTACT_PHONE_INVALID')
  }
}

test.group('normalizeContactPhone', () => {
  test('normalizes Indian national and international numbers', ({ assert }) => {
    assert.equal(normalizeContactPhone('9876543210', 'IN'), '919876543210')
    assert.equal(normalizeContactPhone('09876543210', 'IN'), '919876543210')
    assert.equal(normalizeContactPhone('+919876543210'), '919876543210')
    assert.equal(normalizeContactPhone('+91 98765 43210'), '919876543210')
  })

  test('normalizes US national and international numbers', ({ assert }) => {
    assert.equal(normalizeContactPhone('4155552671', 'US'), '14155552671')
    assert.equal(normalizeContactPhone('+14155552671'), '14155552671')
  })

  test('normalizes UK national and international numbers', ({ assert }) => {
    assert.equal(normalizeContactPhone('07911123456', 'GB'), '447911123456')
    assert.equal(normalizeContactPhone('+447911123456'), '447911123456')
  })

  test('normalizes additional countries via the library, not a calling-code map', ({ assert }) => {
    assert.equal(normalizeContactPhone('4165552671', 'CA'), '14165552671')
    assert.equal(normalizeContactPhone('+14165552671'), '14165552671')
    assert.equal(normalizeContactPhone('501234567', 'AE'), '971501234567')
    assert.equal(normalizeContactPhone('+971501234567'), '971501234567')
    assert.equal(normalizeContactPhone('15123456789', 'DE'), '4915123456789')
    assert.equal(normalizeContactPhone('+4915123456789'), '4915123456789')
    assert.equal(normalizeContactPhone('412345678', 'AU'), '61412345678')
    assert.equal(normalizeContactPhone('+61412345678'), '61412345678')
    assert.equal(normalizeContactPhone('81234567', 'SG'), '6581234567')
    assert.equal(normalizeContactPhone('+6581234567'), '6581234567')
  })

  test('strips spaces, hyphens, and parentheses to the same canonical value', ({ assert }) => {
    assert.equal(normalizeContactPhone('+91 98765 43210'), '919876543210')
    assert.equal(normalizeContactPhone('+91-98765-43210'), '919876543210')
    assert.equal(normalizeContactPhone('+91 (98765) 43210'), '919876543210')
    assert.equal(normalizeContactPhone('98765 43210', 'IN'), '919876543210')
    assert.equal(normalizeContactPhone('(415) 555-2671', 'US'), '14155552671')
    assert.equal(normalizeContactPhone('+1 (415) 555-2671'), '14155552671')
  })

  test('accepts an international number without countryCode', ({ assert }) => {
    assert.equal(normalizeContactPhone('+919876543210'), '919876543210')
    assert.equal(normalizeContactPhone('+14155552671'), '14155552671')
    assert.equal(normalizeContactPhone('+447911123456'), '447911123456')
  })

  test('does not treat a 10-digit US number as Indian', ({ assert }) => {
    const normalized = normalizeContactPhone('4155552671', 'US')
    assert.equal(normalized, '14155552671')
    assert.notEqual(normalized, '914155552671')
  })

  test('rejects a national number without countryCode', ({ assert }) => {
    assertInvalid(assert, () => normalizeContactPhone('9876543210'))
    assertInvalid(assert, () => normalizeContactPhone('4155552671'))
    assertInvalid(assert, () => normalizeContactPhone('07911123456'))
  })

  test('rejects empty, letters-only, invalid, and malformed input', ({ assert }) => {
    assertInvalid(assert, () => normalizeContactPhone(''))
    assertInvalid(assert, () => normalizeContactPhone('   '))
    assertInvalid(assert, () => normalizeContactPhone('not-a-phone'))
    assertInvalid(assert, () => normalizeContactPhone('abcdefghij', 'IN'))
    assertInvalid(assert, () => normalizeContactPhone('12345', 'IN'))
    assertInvalid(assert, () => normalizeContactPhone('+12'))
    assertInvalid(assert, () => normalizeContactPhone('+999999999999'))
    assertInvalid(assert, () => normalizeContactPhone('9876543210', 'ZZ'))
    assertInvalid(assert, () => normalizeContactPhone('9876543210', 'INN'))
  })

  test('same number in different formatting produces the same normalized value', ({ assert }) => {
    const expected = '919876543210'
    assert.equal(normalizeContactPhone('9876543210', 'in'), expected)
    assert.equal(normalizeContactPhone('9876543210', ' IN '), expected)
    assert.equal(normalizeContactPhone('+91 98765 43210', 'IN'), expected)
    assert.equal(normalizeContactPhone('+919876543210', 'US'), expected)
  })
})

test.group('normalizeWhatsappWaId', () => {
  test('parses Meta digits-only wa_id as international, not national', ({ assert }) => {
    assert.equal(normalizeWhatsappWaId('919811122222'), '919811122222')
    assert.equal(normalizeWhatsappWaId('14155552671'), '14155552671')
    assert.equal(normalizeWhatsappWaId('15551234567'), '15551234567')
  })

  test('accepts wa_id with a leading plus', ({ assert }) => {
    assert.equal(normalizeWhatsappWaId('+919811122222'), '919811122222')
    assert.equal(normalizeWhatsappWaId('+14155552671'), '14155552671')
  })
})
