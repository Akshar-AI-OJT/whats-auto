import { test } from '@japa/runner'
import {
  createOrganizationValidator,
  updateOrganizationValidator,
} from '#validators/organization_crud'

const validCreateBody = {
  name: 'Acme Inc',
  slug: 'acme-inc',
  email: 'ops@acme.com',
  phone: '+919876543210',
  organizationType: 'company' as const,
  address: '221B Baker Street, Mumbai',
  country: 'IN',
  timezone: 'Asia/Kolkata',
}

test.group('Organization update validator — PAN/GSTIN', () => {
  test('accepts patch with pan and gstin omitted', async ({ assert }) => {
    const payload = await updateOrganizationValidator.validate({
      name: 'Acme Updated',
    })
    assert.equal(payload.name, 'Acme Updated')
    assert.isUndefined(payload.pan)
    assert.isUndefined(payload.gstin)
  })

  test('accepts empty pan and gstin to clear values', async ({ assert }) => {
    const payload = await updateOrganizationValidator.validate({
      pan: '',
      gstin: '',
    })
    assert.equal(payload.pan, '')
    assert.equal(payload.gstin, '')
  })

  test('accepts valid pan and gstin', async ({ assert }) => {
    const payload = await updateOrganizationValidator.validate({
      pan: 'aaaaa0000a',
      gstin: '27aaaaa0000a1z5',
    })
    assert.equal(payload.pan, 'AAAAA0000A')
    assert.equal(payload.gstin, '27AAAAA0000A1Z5')
  })

  test('rejects invalid pan', async ({ assert }) => {
    await assert.rejects(() =>
      updateOrganizationValidator.validate({
        pan: 'NOT-A-PAN',
      })
    )
  })

  test('rejects invalid gstin', async ({ assert }) => {
    await assert.rejects(() =>
      updateOrganizationValidator.validate({
        gstin: 'INVALID',
      })
    )
  })
})

test.group('Organization create validator — PAN/GSTIN unchanged', () => {
  test('accepts create without pan or gstin', async ({ assert }) => {
    const payload = await createOrganizationValidator.validate(validCreateBody)
    assert.isUndefined(payload.pan)
    assert.isUndefined(payload.gstin)
  })

  test('accepts create with valid pan and gstin', async ({ assert }) => {
    const payload = await createOrganizationValidator.validate({
      ...validCreateBody,
      pan: 'aaaaa0000a',
      gstin: '27aaaaa0000a1z5',
    })
    assert.equal(payload.pan, 'AAAAA0000A')
    assert.equal(payload.gstin, '27AAAAA0000A1Z5')
  })

  test('rejects create with invalid pan when provided', async ({ assert }) => {
    await assert.rejects(() =>
      createOrganizationValidator.validate({
        ...validCreateBody,
        pan: 'BAD',
      })
    )
  })
})
