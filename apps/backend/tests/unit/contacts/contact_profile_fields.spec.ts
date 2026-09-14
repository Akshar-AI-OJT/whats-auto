import { test } from '@japa/runner'
import { validateContactProfileFields } from '#validators/contact'

test.group('validateContactProfileFields', () => {
  test('accepts the same optional name/email/company rules as create-contact', async ({
    assert,
  }) => {
    const result = await validateContactProfileFields({
      name: ' Ada ',
      email: 'ada@example.com',
      company: 'Acme',
    })
    assert.isTrue(result.ok)
    if (result.ok) {
      assert.equal(result.value.name, 'Ada')
      assert.equal(result.value.email, 'ada@example.com')
      assert.equal(result.value.company, 'Acme')
    }
  })

  test('rejects invalid email and oversize name/company', async ({ assert }) => {
    const email = await validateContactProfileFields({ email: 'not-an-email' })
    assert.isFalse(email.ok)
    if (!email.ok) assert.equal(email.message, 'Invalid email address')

    const name = await validateContactProfileFields({ name: 'A'.repeat(256) })
    assert.isFalse(name.ok)
    if (!name.ok) assert.equal(name.message, 'Name is too long')

    const company = await validateContactProfileFields({ company: 'C'.repeat(256) })
    assert.isFalse(company.ok)
    if (!company.ok) assert.equal(company.message, 'Company is too long')
  })
})
