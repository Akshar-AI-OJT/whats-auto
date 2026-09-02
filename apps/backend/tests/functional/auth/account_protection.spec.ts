import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { ensureDemoFixtures } from '#tests/helpers/ensure_demo_fixtures'
import { auth } from '#lib/auth'

test.group('Auth account protection (B-4)', (group) => {
  group.setup(async () => {
    await ensureDemoFixtures()
  })

  test('sign-in email rejects unknown user with ACCOUNT_NOT_FOUND', async ({ client, assert }) => {
    const email = `unknown-${randomUUID().slice(0, 8)}@example.com`

    const response = await client.post('/api/auth/sign-in/email').json({
      email,
      password: 'not-a-real-password',
    })

    response.assertStatus(403)
    const body = response.body() as { code?: string; message?: string }
    assert.equal(body.code, 'ACCOUNT_NOT_FOUND')

    const user = await db.from('users').whereRaw('LOWER(email) = ?', [email]).first()
    assert.isNull(user)
  })

  test('sign-in email allows pre-provisioned active user', async ({ assert }) => {
    const result = (await auth.api.signInEmail({
      body: { email: DEMO_USERS.northstarOwner, password: DEMO_PASSWORD },
    })) as { token?: string; user?: { id: string } }

    assert.exists(result.token)
    assert.exists(result.user?.id)
  })

  test('sign-in email rejects suspended user', async ({ client, assert }) => {
    const email = `suspended-${randomUUID().slice(0, 8)}@example.com`
    const [user] = await db
      .table('users')
      .insert({
        name: 'Suspended User',
        firstname: 'Suspended',
        lastname: 'User',
        email,
        emailVerified: true,
        isActive: false,
        isDeleted: false,
      })
      .returning(['id'])

    try {
      const response = await client.post('/api/auth/sign-in/email').json({
        email,
        password: 'any-password',
      })

      response.assertStatus(403)
      const body = response.body() as { code?: string }
      assert.equal(body.code, 'ACCOUNT_SUSPENDED')
    } finally {
      await db.from('users').where('id', user.id).delete()
    }
  })
})
