import { test } from '@japa/runner'
import ContactException from '#exceptions/contact_exception'
import {
  canonicalizeIndianMobile,
  isValidContactPhone,
  normalizeContactPhone,
} from '#lib/contact_phone'

test.group('normalizeContactPhone', () => {
  test('canonicalizes 10-digit and 91-prefixed Indian mobiles to 91XXXXXXXXXX', ({ assert }) => {
    assert.equal(normalizeContactPhone('9909912691'), '919909912691')
    assert.equal(normalizeContactPhone('919909912691'), '919909912691')
    assert.equal(normalizeContactPhone('+91 99099 12691'), '919909912691')
    assert.equal(normalizeContactPhone('09909912691'), '919909912691')
    assert.equal(normalizeContactPhone('0091-9909912691'), '919909912691')
    assert.equal(canonicalizeIndianMobile('9109909912691'), '919909912691')
    assert.isTrue(isValidContactPhone('9876543210'))
  })

  test('rejects invalid formats', ({ assert }) => {
    assert.isNull(canonicalizeIndianMobile('12345'))
    assert.isNull(canonicalizeIndianMobile('15551234567'))
    assert.isNull(canonicalizeIndianMobile('5123456789'))
    assert.isFalse(isValidContactPhone(''))

    try {
      normalizeContactPhone('990991269')
      assert.fail('expected invalid phone')
    } catch (error) {
      assert.instanceOf(error, ContactException)
      assert.equal((error as ContactException).code, 'E_CONTACT_PHONE_INVALID')
    }
  })
})
