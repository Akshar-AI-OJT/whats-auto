import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { CREDENTIAL_ACCOUNT_ISSUER, GOOGLE_ACCOUNT_ISSUER } from '#lib/account_issuer'
import { hashOtp, hashPassword, storePendingSignup } from '#lib/pre_signup'

test.group('Email registration', () => {
  test('verify-signup creates a credential account with issuer', async ({ client, assert }) => {
    const email = `signup-${randomUUID().slice(0, 8)}@example.com`
    const password = 'Secret1234'
    const otp = '123456'

    await storePendingSignup({
      firstname: 'Ada',
      lastname: 'Lovelace',
      email,
      passwordHash: await hashPassword(password),
      otpHash: hashOtp(otp),
      lastSentAt: Date.now(),
    })

    const response = await client.post('/api/v1/auth/verify-signup').json({
      email,
      otp,
      password,
    })

    response.assertStatus(200)

    const user = await db.from('users').where('email', email).first()
    assert.exists(user)

    const account = await db.from('accounts').where('userId', user.id).where('providerId', 'credential').first()
    assert.equal(account?.issuer, CREDENTIAL_ACCOUNT_ISSUER)
    assert.isNotNull(account?.password)

    await db.from('users').where('id', user.id).delete()
  })

  test('pre-signup tells a Google-only account to sign in with Google', async ({ client, assert }) => {
    const email = `google-${randomUUID().slice(0, 8)}@example.com`
    const [user] = await db
      .table('users')
      .insert({
        name: 'Google User',
        firstname: 'Google',
        lastname: 'User',
        email,
        emailVerified: true,
        isActive: true,
        isDeleted: false,
      })
      .returning(['id'])

    await db.table('accounts').insert({
      userId: user.id,
      accountId: `google-${user.id}`,
      providerId: 'google',
      issuer: GOOGLE_ACCOUNT_ISSUER,
      password: null,
    })

    try {
      const response = await client.post('/api/v1/auth/pre-signup').json({
        firstname: 'Google',
        lastname: 'User',
        email,
        password: 'Secret1234',
      })

      response.assertStatus(422)
      assert.equal(response.body().code, 'USE_GOOGLE_SIGN_IN')
    } finally {
      await db.from('users').where('id', user.id).delete()
    }
  })
})
