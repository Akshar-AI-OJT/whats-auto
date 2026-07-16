import { betterAuth } from 'better-auth'
import { createAuthMiddleware, APIError } from 'better-auth/api'
import { emailOTP } from 'better-auth/plugins'
import { jwt } from 'better-auth/plugins'
import env from '#start/env'
import hash from '@adonisjs/core/services/hash'
import { pool } from '#lib/db'
import { resend } from '#lib/mail'

const googleClientId = env.get('GOOGLE_CLIENT_ID')
const googleClientSecret = env.get('GOOGLE_CLIENT_SECRET')
const hasGoogle = Boolean(googleClientId) && Boolean(googleClientSecret)

export const auth = betterAuth({
  database: pool,
  baseURL: env.get('BETTER_AUTH_URL'),
  secret: env.get('BETTER_AUTH_SECRET').release(),
  trustedOrigins: [env.get('CORS_ORIGIN'), env.get('BETTER_AUTH_URL')],

  // DB columns are Postgres `uuid`. better-auth's default nanoid IDs are not valid UUIDs.
  advanced: {
    database: {
      generateId: 'uuid',
    },
  },

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
    accountLinking: {
      enabled: false,
      trustedProviders: [],
    },
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
    // Override the default better-auth password hashing behavior:
    password: {
      hash: async (password: string) => {
        // Hash using AdonisJS hash service (scrypt)
        return await hash.make(password)
      },
      verify: async ({ password, hash: hashedPassword }) => {
        // Verify using AdonisJS hash service
        return await hash.verify(hashedPassword, password)
      },
    },
    sendResetPassword: async ({ user, url }) => {
      const { error } = await resend.emails.send({
        from: env.get('EMAIL_FROM'),
        to: user.email,
        subject: 'Reset your Whats-Auto password',
        html: `
          <p>Hi ${user.name ?? user.email},</p>
          <p>Click the link below to reset your password. It expires in 1 hour.</p>
          <p><a href="${url}">Reset Password</a></p>
          <p>If you didn't request this, ignore this email.</p>
        `,
      })

      if (error) {
        throw new Error(`Failed to send reset email: ${error.message}`)
      }
    },
    resetPasswordTokenExpiresIn: 3600,
  },

  // ─── Google OAuth (only when credentials are present) ─────────────────
  ...(hasGoogle
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId!,
            clientSecret: googleClientSecret!.release(),
          },
        },
      }
    : {}),

  // ─── App-layer guard: block suspended / deleted users at sign-in ───────
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/sign-up/email') {
        throw new APIError('BAD_REQUEST', {
          message: 'Email signup requires OTP verification. Use the registration form.',
        })
      }

      if (ctx.path === '/sign-up/social' || ctx.path === '/sign-in/social') {
        const body = ctx.body as { email?: string }
        if (body.email) {
          const { rows: existingUsers } = await pool.query(
            `SELECT id FROM "users" WHERE "email" = $1 LIMIT 1`,
            [body.email]
          )

          if (existingUsers.length > 0) {
            throw new APIError('UNPROCESSABLE_ENTITY', {
              message:
                'An account with this email already exists. Please sign in with your password.',
            })
          }
        }
      }

      const signInPaths = ['/sign-in/email', '/sign-in/social']
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
      // Without this, requireEmailVerification: true has nothing to call —
      // better-auth never wires sendVerificationEmail → OTP on its own.
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp, type }) {
        console.info(`[emailOTP] sending ${type} OTP to ${email}`)

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
          console.error('[emailOTP] Resend error:', error)
          throw new Error(`Failed to send OTP email: ${error.message}`)
        }
      },
      otpLength: 6,
      expiresIn: 300, // 5 minutes
    }),

    // ─── JWT — signs short-lived access tokens for AdonisJS API calls ────
    jwt(),
  ],
})
