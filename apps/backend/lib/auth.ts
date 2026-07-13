import { betterAuth } from 'better-auth'
import { createAuthMiddleware, APIError } from 'better-auth/api'
import { emailOTP } from 'better-auth/plugins'
import { magicLink } from 'better-auth/plugins'
import { jwt } from 'better-auth/plugins'
import { Pool } from 'pg'
import { Resend } from 'resend'
import env from '#start/env'
const pool = new Pool({
  host: env.get('PG_HOST'),
  port: env.get('PG_PORT'),
  user: env.get('PG_USER'),
  password: env.get('PG_PASSWORD').valueOf(),
  database: env.get('PG_DB_NAME'),
})

const resend = new Resend(env.get('RESEND_API_KEY').valueOf())

const googleClientId = env.get('GOOGLE_CLIENT_ID')
const googleClientSecret = env.get('GOOGLE_CLIENT_SECRET')
const hasGoogle = Boolean(googleClientId) && Boolean(googleClientSecret)

export const auth = betterAuth({
  database: pool,
  baseURL: env.get('BETTER_AUTH_URL'),
  secret: env.get('BETTER_AUTH_SECRET').valueOf(),

  // ─── Table name overrides (migrations use plural names) ───────────────
  user: {
    modelName: 'users',
    fields: {
      name: 'name',
      emailVerified: 'emailVerified',
      image: 'image',
    },
    additionalFields: {
      firstname: { type: 'string', required: true, input: true },
      lastname: { type: 'string', required: true, input: true },
      isActive: { type: 'boolean', defaultValue: true, input: false },
      isDeleted: { type: 'boolean', defaultValue: false, input: false },
    },
  },

  account: {
    modelName: 'accounts',
  },

  session: {
    modelName: 'sessions',
    cookieCache: { enabled: true, maxAge: 60 * 60 },
  },

  verification: {
    modelName: 'verifications',
  },

  // ─── Email + password ──────────────────────────────────────────────────
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  // ─── Google OAuth (only when credentials are present) ─────────────────
  ...(hasGoogle
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId!,
            clientSecret: googleClientSecret!.valueOf(),
          },
        },
      }
    : {}),

  // ─── App-layer guard: block suspended / deleted users at sign-in ───────
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const signInPaths = ['/sign-in/email', '/sign-in/social', '/sign-in/magic-link']
      if (!signInPaths.includes(ctx.path)) return

      const { email } = ctx.body as { email?: string }
      if (!email) return

      const { rows } = await pool.query<{ isActive: boolean; isDeleted: boolean }>(
        `SELECT "isActive", "isDeleted" FROM "users" WHERE "email" = $1 LIMIT 1`,
        [email]
      )

      if (!rows.length) return // unknown email — let better-auth handle it

      if (rows[0].isDeleted) {
        throw new APIError('FORBIDDEN', { message: 'Account no longer exists.' })
      }
      if (!rows[0].isActive) {
        throw new APIError('FORBIDDEN', { message: 'Account is suspended. Contact support.' })
      }
    }),
  },

  plugins: [
    // ─── Email OTP — sent after email+password signup ────────────────────
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        const { error } = await resend.emails.send({
          from: env.get('EMAIL_FROM'),
          to: email,
          subject: 'Your Verification Code',
          text: `Your code is: ${otp}. It expires in 5 minutes.`,
        })

        // Surface email failures so the caller gets a 500, not a silent failure.
        // The user row already exists as unverified — they can request a new OTP
        // from the login page (better-auth's resend endpoint).
        if (error) {
          throw new Error(`Failed to send OTP email: ${error.message}`)
        }
      },
      otpLength: 6,
      expiresIn: 300, // 5 minutes
    }),

    // ─── Magic link — passwordless login ─────────────────────────────────
    magicLink({
      async sendMagicLink({ email, url }) {
        const { error } = await resend.emails.send({
          from: env.get('EMAIL_FROM'),
          to: email,
          subject: 'Your Magic Sign-in Link',
          html: `<p>Click to sign in (expires in 5 min):</p><p><a href="${url}">Sign In</a></p>`,
        })

        if (error) {
          throw new Error(`Failed to send magic link email: ${error.message}`)
        }
      },
      expiresIn: 300, // 5 minutes
    }),

    // ─── JWT — signs short-lived access tokens for AdonisJS API calls ────
    jwt(),
  ],
})
