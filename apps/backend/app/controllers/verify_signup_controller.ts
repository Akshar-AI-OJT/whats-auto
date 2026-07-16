import type { HttpContext } from '@adonisjs/core/http'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '#lib/auth'
import { pool } from '#lib/db'
import { copyBetterAuthResponse } from '#lib/copy_better_auth_response'
import {
  deletePendingSignup,
  loadPendingSignup,
  verificationKey,
  verifyOtp,
  verifyPassword,
} from '#lib/pre_signup'
import { verifySignupValidator } from '#validators/auth'

export default class VerifySignupController {
  async handle({ request, response }: HttpContext) {
    const { email, otp, password } = await request.validateUsing(verifySignupValidator)
    const pending = await loadPendingSignup(email)

    if (!pending) {
      return response.badRequest({ error: 'No pending signup found. Please register again.' })
    }

    if (new Date(pending.expiresAt) < new Date()) {
      await deletePendingSignup(email)
      return response.badRequest({ error: 'OTP has expired. Please register again.' })
    }

    if (!verifyOtp(otp, pending.payload.otpHash)) {
      return response.badRequest({ error: 'Invalid OTP. Please check your email.' })
    }

    const passwordMatches = await verifyPassword(password, pending.payload.passwordHash)
    if (!passwordMatches) {
      return response.badRequest({
        error: 'Password does not match the one used during registration.',
        code: 'PASSWORD_MISMATCH',
      })
    }

    const { firstname, lastname, passwordHash } = pending.payload
    const name = `${firstname} ${lastname}`.trim()

    let userId: string | null = null
    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      const existingUser = await client.query(`SELECT id FROM "users" WHERE "email" = $1 LIMIT 1`, [
        email,
      ])

      if (existingUser.rows.length > 0) {
        await client.query('ROLLBACK')
        return response.unprocessableEntity({
          error: 'An account with this email already exists.',
          code: 'EMAIL_ALREADY_EXISTS',
        })
      }

      const userResult = await client.query<{ id: string }>(
        `INSERT INTO "users" (
          "name", "firstname", "lastname", "email", "emailVerified",
          "isActive", "isDeleted", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, $4, TRUE, TRUE, FALSE, NOW(), NOW())
        RETURNING "id"`,
        [name, firstname, lastname, email]
      )

      userId = userResult.rows[0].id

      await client.query(
        `INSERT INTO "accounts" (
          "userId", "accountId", "providerId", "password", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, 'credential', $3, NOW(), NOW())`,
        [userId, userId, passwordHash]
      )

      // Keep pending OTP until sign-in succeeds so a failed session can retry.
      await client.query('COMMIT')
    } catch {
      await client.query('ROLLBACK')
      return response.internalServerError({ error: 'Failed to create account. Please try again.' })
    } finally {
      client.release()
    }

    let webResponse: Response
    try {
      webResponse = await auth.api.signInEmail({
        body: { email, password },
        headers: fromNodeHeaders(request.headers()),
        asResponse: true,
      })
    } catch {
      if (userId) {
        await pool.query(`DELETE FROM "users" WHERE "id" = $1`, [userId])
      }
      return response.internalServerError({
        error: 'Account created but sign-in failed. Please try verifying again.',
      })
    }

    if (!webResponse.ok) {
      if (userId) {
        await pool.query(`DELETE FROM "users" WHERE "id" = $1`, [userId])
      }
      return copyBetterAuthResponse({ request, response } as HttpContext, webResponse)
    }

    await pool.query(`DELETE FROM "verifications" WHERE "identifier" = $1`, [
      verificationKey(email),
    ])

    return copyBetterAuthResponse({ request, response } as HttpContext, webResponse)
  }
}
