import { randomInt } from 'node:crypto'
import { resend } from '#lib/mail'
import { pool } from '#lib/db'
import env from '#start/env'

export const PRE_SIGNUP_PREFIX = 'pre-signup:'
export const OTP_EXPIRY_MS = 5 * 60 * 1000

export type PendingSignup = {
  firstname: string
  lastname: string
  email: string
  otp: string
}

export function verificationKey(email: string) {
  return `${PRE_SIGNUP_PREFIX}${email.toLowerCase()}`
}

export function generateOtp() {
  return String(randomInt(100000, 1_000_000))
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
