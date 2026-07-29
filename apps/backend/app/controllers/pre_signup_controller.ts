import type { HttpContext } from '@adonisjs/core/http'
import { pool } from '#lib/db'
import {
  generateOtp,
  hashOtp,
  hashPassword,
  loadPendingSignup,
  resendCooldownRemainingMs,
  sendSignupOtpEmail,
  storePendingSignup,
} from '#lib/pre_signup'
import { preSignupValidator, resendSignupOtpValidator } from '#validators/auth'

export default class PreSignupController {
  /**
   * @handle
   * @summary Initiate registration (step 1 of 2)
   * @description Validates email uniqueness, hashes the password, stores a pending signup,
   * and sends a 6-digit OTP to the given email address.
   * @tag Auth
   * @requestBody { "firstname": "John", "lastname": "Doe", "email": "john@example.com", "password": "secret1234" }
   * @responseBody 200 - { "status": "otp_sent" }
   * @responseBody 422 - { "error": "An account with this email already exists.", "code": "EMAIL_ALREADY_EXISTS" }
   * @responseBody 500 - { "error": "Failed to send OTP. Please try again." }
   * @responseBody 429 - { "error": "Too many requests. Please try again later.", "code": "RATE_LIMITED" }
   */
  async handle({ request, response }: HttpContext) {
    const { firstname, lastname, email, password } = await request.validateUsing(preSignupValidator)

    const { rows } = await pool.query(`SELECT id FROM "users" WHERE "email" = $1 LIMIT 1`, [email])

    if (rows.length > 0) {
      return response.unprocessableEntity({
        error: 'An account with this email already exists.',
        code: 'EMAIL_ALREADY_EXISTS',
      })
    }

    const otp = generateOtp()
    const passwordHash = await hashPassword(password)

    try {
      await storePendingSignup({
        firstname,
        lastname,
        email,
        passwordHash,
        otpHash: hashOtp(otp),
        lastSentAt: Date.now(),
      })
      await sendSignupOtpEmail(email, otp)
    } catch {
      return response.internalServerError({ error: 'Failed to send OTP. Please try again.' })
    }

    return response.ok({ status: 'otp_sent' })
  }

  /**
   * @resend
   * @summary Resend OTP (step 1b — resend)
   * @description Resends the OTP to a pending signup email. Subject to a 60s cooldown.
   * @tag Auth
   * @requestBody { "email": "john@example.com" }
   * @responseBody 200 - { "status": "otp_sent" }
   * @responseBody 400 - { "error": "No pending signup found. Please register again." }
   * @responseBody 429 - { "error": "Please wait 45s before requesting another code.", "code": "RESEND_COOLDOWN", "retryAfter": 45 }
   * @responseBody 500 - { "error": "Failed to send OTP. Please try again." }
   */
  async resend({ request, response }: HttpContext) {
    const { email } = await request.validateUsing(resendSignupOtpValidator)
    const pending = await loadPendingSignup(email)

    if (!pending) {
      return response.badRequest({ error: 'No pending signup found. Please register again.' })
    }

    if (new Date(pending.expiresAt) < new Date()) {
      return response.badRequest({ error: 'OTP has expired. Please register again.' })
    }

    const remainingMs = resendCooldownRemainingMs(pending.payload.lastSentAt ?? 0)
    if (remainingMs > 0) {
      const retryAfter = Math.ceil(remainingMs / 1000)
      response.header('Retry-After', String(retryAfter))
      return response.tooManyRequests({
        error: `Please wait ${retryAfter}s before requesting another code.`,
        code: 'RESEND_COOLDOWN',
        retryAfter,
      })
    }

    const otp = generateOtp()

    try {
      await storePendingSignup({
        ...pending.payload,
        email,
        otpHash: hashOtp(otp),
        lastSentAt: Date.now(),
      })
      await sendSignupOtpEmail(email, otp)
    } catch {
      return response.internalServerError({ error: 'Failed to send OTP. Please try again.' })
    }

    return response.ok({ status: 'otp_sent' })
  }
}
