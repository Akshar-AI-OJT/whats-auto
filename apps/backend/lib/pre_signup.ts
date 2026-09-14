import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import hash from '@adonisjs/core/services/hash'
import env from '#start/env'
import { pool } from '#lib/db'
import mail from '@adonisjs/mail/services/main'

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
  await mail.send((message) => {
    message
      .to(email)
      .subject('Your Whats-Auto Verification Code')
      .text(`Your Whats-Auto verification code is: ${otp}. It expires in 5 minutes.`).html(`
      <div style="margin:0; padding:40px 20px; background-color:#f4f6f8; font-family:Arial,Helvetica,sans-serif;">
        <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
  
          <div style="padding:28px 32px; border-bottom:1px solid #e5e7eb;">
            <div style="font-size:22px; font-weight:700; color:#111827;">
              Whats-Auto
            </div>
          </div>
  
          <div style="padding:32px;">
            <h1 style="margin:0 0 16px; font-size:24px; line-height:32px; color:#111827;">
              Verify your email
            </h1>
  
            <p style="margin:0 0 24px; font-size:15px; line-height:24px; color:#4b5563;">
              Use the verification code below to complete your Whats-Auto registration.
            </p>
  
            <div style="margin:0 0 24px; text-align:center;">
              <div style="
                display:inline-block;
                padding:16px 28px;
                background:#f3f4f6;
                border:1px solid #e5e7eb;
                border-radius:8px;
                font-size:32px;
                line-height:40px;
                font-weight:700;
                letter-spacing:8px;
                color:#111827;
              ">
                ${otp}
              </div>
            </div>
  
            <p style="margin:0 0 16px; font-size:13px; line-height:20px; color:#6b7280; text-align:center;">
              This verification code expires in <strong>5 minutes</strong>.
            </p>
  
            <p style="margin:0; font-size:13px; line-height:20px; color:#6b7280;">
              If you didn't request this code, you can safely ignore this email.
            </p>
          </div>
  
          <div style="padding:20px 32px; background:#f9fafb; border-top:1px solid #e5e7eb;">
            <p style="margin:0; font-size:12px; line-height:18px; color:#9ca3af; text-align:center;">
              This is an automated email from Whats-Auto. Please do not reply to this email.
            </p>
          </div>
  
        </div>
      </div>
    `)
  })

  if (env.get('NODE_ENV') === 'development') {
    console.info(`[DEV] OTP email sent to ${email}. OTP: ${otp}`)
  }
  return
}
