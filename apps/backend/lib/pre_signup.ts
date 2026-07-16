import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import hash from '@adonisjs/core/services/hash'
import env from '#start/env'
import { pool } from '#lib/db'
import { resend } from '#lib/mail'

export const PRE_SIGNUP_PREFIX = 'pre-signup:'
export const OTP_EXPIRY_MS = 5 * 60 * 1000
export const RESEND_COOLDOWN_MS = 60 * 1000

export type PendingSignup = {
  firstname: string
  lastname: string
  email: string
  /** scrypt hash of the registration password */
  passwordHash: string
  /** HMAC of the OTP (never store plaintext OTP) */
  otpHash: string
  /** epoch ms when the last OTP email was sent */
  lastSentAt: number
}

export function verificationKey(email: string) {
  return `${PRE_SIGNUP_PREFIX}${email.toLowerCase()}`
}

export function generateOtp() {
  return String(randomInt(100000, 1_000_000))
}

function otpHmac(otp: string) {
  return createHmac('sha256', env.get('BETTER_AUTH_SECRET').release()).update(otp).digest('hex')
}

export function hashOtp(otp: string) {
  return otpHmac(otp)
}

export function verifyOtp(otp: string, otpHash: string) {
  const computed = Buffer.from(otpHmac(otp))
  const expected = Buffer.from(otpHash)
  if (computed.length !== expected.length) {
    return false
  }
  return timingSafeEqual(computed, expected)
}

export async function hashPassword(password: string) {
  return hash.make(password)
}

export async function verifyPassword(password: string, passwordHash: string) {
  return hash.verify(passwordHash, password)
}

export async function storePendingSignup(payload: PendingSignup) {
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS)

  await pool.query(`DELETE FROM "verifications" WHERE "identifier" = $1`, [
    verificationKey(payload.email),
  ])

  await pool.query(
    `INSERT INTO "verifications" ("identifier", "value", "expiresAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, NOW(), NOW())`,
    [verificationKey(payload.email), JSON.stringify(payload), expiresAt]
  )
}

export async function loadPendingSignup(email: string) {
  const { rows } = await pool.query<{ value: string; expiresAt: Date }>(
    `SELECT "value", "expiresAt" FROM "verifications" WHERE "identifier" = $1 LIMIT 1`,
    [verificationKey(email)]
  )

  if (!rows.length) {
    return null
  }

  return {
    payload: JSON.parse(rows[0].value) as PendingSignup,
    expiresAt: rows[0].expiresAt,
  }
}

export async function deletePendingSignup(email: string) {
  await pool.query(`DELETE FROM "verifications" WHERE "identifier" = $1`, [verificationKey(email)])
}

export function resendCooldownRemainingMs(lastSentAt: number) {
  const elapsed = Date.now() - lastSentAt
  return Math.max(0, RESEND_COOLDOWN_MS - elapsed)
}

export async function sendSignupOtpEmail(email: string, otp: string) {
  const { error } = await resend.emails.send({
    from: env.get('EMAIL_FROM'),
    to: email,
    subject: 'Your Whats-Auto Verification Code',
    text: `Your verification code is: ${otp}. It expires in 5 minutes.`,
  })

  if (error) {
    throw new Error(`Failed to send OTP email: ${error.message}`)
  }
}
