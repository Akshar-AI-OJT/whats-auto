import type { HttpContext } from '@adonisjs/core/http'
import { pool } from '#lib/db'
import {
  generateOtp,
  loadPendingSignup,
  sendSignupOtpEmail,
  storePendingSignup,
} from '#lib/pre_signup'

export default class PreSignupController {
  async handle({ request, response }: HttpContext) {
    const { firstname, lastname, email, password } = request.body() as {
      firstname?: string
      lastname?: string
      email?: string
      password?: string
    }

    if (!firstname || !lastname || !email || !password) {
      return response.unprocessableEntity({ error: 'All fields are required.' })
    }

    if (password.length < 8) {
      return response.unprocessableEntity({ error: 'Password must be at least 8 characters.' })
    }

    const normalizedEmail = email.toLowerCase()

    const { rows } = await pool.query(`SELECT id FROM "users" WHERE "email" = $1 LIMIT 1`, [
      normalizedEmail,
    ])

    if (rows.length > 0) {
      return response.unprocessableEntity({
        error: 'An account with this email already exists.',
      })
    }

    const otp = generateOtp()

    try {
      await storePendingSignup({
        firstname,
        lastname,
        email: normalizedEmail,
        otp,
      })
      await sendSignupOtpEmail(normalizedEmail, otp)
    } catch {
      return response.internalServerError({ error: 'Failed to send OTP. Please try again.' })
    }

    return response.ok({ status: 'otp_sent' })
  }

  async resend({ request, response }: HttpContext) {
    const { email } = request.body() as { email?: string }

    if (!email) {
      return response.unprocessableEntity({ error: 'Email is required.' })
    }

    const normalizedEmail = email.toLowerCase()
    const pending = await loadPendingSignup(normalizedEmail)

    if (!pending) {
      return response.badRequest({ error: 'No pending signup found. Please register again.' })
    }

    if (new Date(pending.expiresAt) < new Date()) {
      return response.badRequest({ error: 'OTP has expired. Please register again.' })
    }

    const otp = generateOtp()

    try {
      await storePendingSignup({
        ...pending.payload,
        email: normalizedEmail,
        otp,
      })
      await sendSignupOtpEmail(normalizedEmail, otp)
    } catch {
      return response.internalServerError({ error: 'Failed to send OTP. Please try again.' })
    }

    return response.ok({ status: 'otp_sent' })
  }
}
