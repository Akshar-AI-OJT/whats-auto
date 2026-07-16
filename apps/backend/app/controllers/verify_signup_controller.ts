import type { HttpContext } from '@adonisjs/core/http'
import { fromNodeHeaders } from 'better-auth/node'
import hash from '@adonisjs/core/services/hash'
import { auth } from '#lib/auth'
import { pool } from '#lib/db'
import { copyBetterAuthResponse } from '#lib/copy_better_auth_response'
import { deletePendingSignup, loadPendingSignup, verificationKey } from '#lib/pre_signup'

export default class VerifySignupController {
  async handle({ request, response }: HttpContext) {
    const { email, otp, password } = request.body() as {
      email?: string
      otp?: string
      password?: string
    }

    if (!email || !otp || !password) {
      return response.unprocessableEntity({ error: 'Email, OTP, and password are required.' })
    }

    if (password.length < 8) {
      return response.unprocessableEntity({ error: 'Password must be at least 8 characters.' })
    }

    const normalizedEmail = email.toLowerCase()
    const pending = await loadPendingSignup(normalizedEmail)

    if (!pending) {
      return response.badRequest({ error: 'No pending signup found. Please register again.' })
    }

    if (new Date(pending.expiresAt) < new Date()) {
      await deletePendingSignup(normalizedEmail)
      return response.badRequest({ error: 'OTP has expired. Please register again.' })
    }

    if (pending.payload.otp !== otp) {
      return response.badRequest({ error: 'Invalid OTP. Please check your email.' })
    }

    const { firstname, lastname } = pending.payload
    const name = `${firstname} ${lastname}`.trim()
    const hashedPassword = await hash.make(password)

    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      const existingUser = await client.query(`SELECT id FROM "users" WHERE "email" = $1 LIMIT 1`, [
        normalizedEmail,
      ])

      if (existingUser.rows.length > 0) {
        await client.query('ROLLBACK')
        return response.unprocessableEntity({
          error: 'An account with this email already exists.',
        })
      }

      const userResult = await client.query<{ id: string }>(
        `INSERT INTO "users" (
          "name", "firstname", "lastname", "email", "emailVerified",
          "isActive", "isDeleted", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, $4, TRUE, TRUE, FALSE, NOW(), NOW())
        RETURNING "id"`,
        [name, firstname, lastname, normalizedEmail]
      )

      const userId = userResult.rows[0].id

      await client.query(
        `INSERT INTO "accounts" (
          "userId", "accountId", "providerId", "password", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, 'credential', $3, NOW(), NOW())`,
        [userId, userId, hashedPassword]
      )

      await client.query(`DELETE FROM "verifications" WHERE "identifier" = $1`, [
        verificationKey(normalizedEmail),
      ])

      await client.query('COMMIT')
    } catch {
      await client.query('ROLLBACK')
      return response.internalServerError({ error: 'Failed to create account. Please try again.' })
    } finally {
      client.release()
    }

    const webResponse = await auth.api.signInEmail({
      body: { email: normalizedEmail, password },
      headers: fromNodeHeaders(request.headers()),
      asResponse: true,
    })

    return copyBetterAuthResponse({ request, response } as HttpContext, webResponse)
  }
}
