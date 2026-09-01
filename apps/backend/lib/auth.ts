import { createHash } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { createAuthMiddleware, APIError } from 'better-auth/api'
import { jwt } from 'better-auth/plugins'
import env from '#start/env'
import hash from '@adonisjs/core/services/hash'
import { pool } from '#lib/db'
import accessTokenConfig from '#config/access_token'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import mail from '@adonisjs/mail/services/main'

const googleClientId = env.get('GOOGLE_CLIENT_ID')
const googleClientSecret = env.get('GOOGLE_CLIENT_SECRET')
const hasGoogle = Boolean(googleClientId) && Boolean(googleClientSecret)

const accessTokenClaimsService = new AccessTokenClaimsService()

/**
 * Better Auth compares Origin strictly. Local Swagger/docs often hit
 * `http://127.0.0.1:3333` while BETTER_AUTH_URL is `http://localhost:3333`
 * (or the reverse) — treat them as equivalent in development.
 */
function withLocalhostAlias(origin: string): string[] {
  const normalized = origin.replace(/\/$/, '')
  const aliases = new Set<string>([normalized])

  try {
    const url = new URL(normalized)
    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1'
      aliases.add(url.origin)
    } else if (url.hostname === '127.0.0.1') {
      url.hostname = 'localhost'
      aliases.add(url.origin)
    }
  } catch {
    // Keep the raw origin if URL parsing fails.
  }

  return [...aliases]
}

function parseOrigins(raw?: string): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

function getTrustedOrigins(): string[] {
  const origins = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3333',
    'http://127.0.0.1:3333',
  ])

  for (const raw of [env.get('CORS_ORIGIN'), env.get('BETTER_AUTH_URL')]) {
    for (const origin of parseOrigins(raw)) {
      for (const alias of withLocalhostAlias(origin)) {
        origins.add(alias)
      }
    }
  }

  return [...origins]
}

type UserAccountState = {
  isActive: boolean
  isDeleted: boolean
}

const ACCOUNT_NOT_FOUND_MESSAGE =
  'No account found with this email. Please contact your administrator for an invitation.'

async function findUserAccountStateByEmail(email: string): Promise<UserAccountState | null> {
  const normalized = email.toLowerCase().trim()
  const { rows } = await pool.query<UserAccountState>(
    `SELECT "isActive", "isDeleted" FROM "users" WHERE LOWER("email") = $1 LIMIT 1`,
    [normalized]
  )
  return rows[0] ?? null
}

function assertUserCanAuthenticate(state: UserAccountState | null) {
  if (!state) {
    throw new APIError('FORBIDDEN', {
      message: ACCOUNT_NOT_FOUND_MESSAGE,
      code: 'ACCOUNT_NOT_FOUND',
    })
  }

  if (state.isDeleted) {
    throw new APIError('FORBIDDEN', {
      message: 'Account no longer exists.',
      code: 'ACCOUNT_DELETED',
    })
  }

  if (!state.isActive) {
    throw new APIError('FORBIDDEN', {
      message: 'Account is suspended. Contact support.',
      code: 'ACCOUNT_SUSPENDED',
    })
  }
}

export const auth = betterAuth({
  database: pool,
  baseURL: env.get('BETTER_AUTH_URL'),
  secret: env.get('BETTER_AUTH_SECRET').release(),
  trustedOrigins: getTrustedOrigins(),

  // DB columns are Postgres `uuid`. better-auth's default nanoid IDs are not valid UUIDs.
  advanced: {
    // Production sits behind a reverse proxy (Caddy/Nginx on Contabo, or Railway).
    // Better Auth will not trust multi-hop X-Forwarded-For unless trustedProxies
    // is set — otherwise it falls back to one shared per-path rate-limit bucket.
    // Prefer x-real-ip then walk XFF with private proxy hops stripped.
    ipAddress: {
      ipAddressHeaders: ['x-real-ip', 'x-forwarded-for'],
      trustedProxies: [
        '10.0.0.0/8',
        '172.16.0.0/12',
        '192.168.0.0/16',
        '100.64.0.0/10', // CGNAT (common cloud edge hop)
        '127.0.0.1',
        '::1',
      ],
    },
    defaultCookieAttributes: {
      // Cross-origin Contabo (app. → api.) or Vercel→Railway: SameSite=None; Secure.
      // Do NOT set Partitioned (CHIPS): the OAuth state cookie is set during a
      // cross-site fetch from the frontend, then read on a top-level Google
      // redirect to BETTER_AUTH_URL. Partitioned cookies are keyed by top-level
      // site, so the callback would omit the cookie → state_mismatch.
      // See better-auth#5871 and better-auth.com/docs/reference/errors/state_mismatch.
      sameSite: env.get('NODE_ENV') === 'production' ? ('none' as const) : ('lax' as const),
      secure: env.get('NODE_ENV') === 'production',
      partitioned: false,
    },
    database: {
      generateId: 'uuid',
    },
  },

  // Prefer frontend when OAuth state cannot be recovered (missing cookie, etc.).
  onAPIError: {
    errorURL: `${parseOrigins(env.get('CORS_ORIGIN'))[0] ?? 'http://localhost:3000'}/login?error=oauth_failed`,
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
    // Option B: same email + Google → link to existing verified user and sign in
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
      allowDifferentEmails: false,
    },
  },

  session: {
    modelName: 'sessions',
    cookieCache: { enabled: true, maxAge: 60 * 60 },
    additionalFields: {
      // Custom column — used by JWT definePayload for tenant scopes
      activeOrganizationId: { type: 'string', required: false, input: false },
    },
  },

  verification: {
    modelName: 'verifications',
  },

  // Email + password
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
      await mail.send((message) => {
        message.to(user.email).subject('Reset your Whats-Auto password').html(`
  <div style="margin:0; padding:40px 20px; background-color:#f4f6f8; font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">

      <!-- Header -->
      <div style="padding:28px 32px; border-bottom:1px solid #e5e7eb;">
        <div style="font-size:22px; font-weight:700; color:#111827;">
          WhatsAuto
        </div>
      </div>

      <!-- Content -->
      <div style="padding:32px;">
        <h1 style="margin:0 0 16px; font-size:24px; line-height:32px; color:#111827;">
          Reset your password
        </h1>

        <p style="margin:0 0 16px; font-size:15px; line-height:24px; color:#4b5563;">
          Hi ${user.name ?? user.email},
        </p>

        <p style="margin:0 0 24px; font-size:15px; line-height:24px; color:#4b5563;">
          We received a request to reset the password for your WhatsAuto account.
          Click the button below to choose a new password.
        </p>

        <!-- Button -->
        <div style="margin:0 0 24px;">
          <a
            href="${url}"
            style="
              display:inline-block;
              padding:12px 22px;
              background-color:#111827;
              color:#ffffff;
              text-decoration:none;
              font-size:15px;
              font-weight:600;
              border-radius:8px;
            "
          >
            Reset Password
          </a>
        </div>

        <p style="margin:0 0 16px; font-size:13px; line-height:20px; color:#6b7280;">
          This link will expire in <strong>1 hour</strong>.
        </p>

        <p style="margin:0; font-size:13px; line-height:20px; color:#6b7280;">
          If you didn't request a password reset, you can safely ignore this email.
          Your password will remain unchanged.
        </p>
      </div>

      <!-- Footer -->
      <div style="padding:20px 32px; background:#f9fafb; border-top:1px solid #e5e7eb;">
        <p style="margin:0; font-size:12px; line-height:18px; color:#9ca3af; text-align:center;">
          This is an automated email from WhatsAuto. Please do not reply to this email.
        </p>
      </div>

    </div>
  </div>
`)
      })
    },
    resetPasswordTokenExpiresIn: 3600,
    onPasswordReset: async ({ user }) => {
      await pool.query(
        `UPDATE "users"
         SET "emailVerified" = true
         WHERE "id" = $1 AND "emailVerified" = false`,
        [user.id]
      )
    },
  },

  // Google OAuth (only when credentials are present)
  ...(hasGoogle
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId!,
            clientSecret: googleClientSecret!.release(),
            disableSignUp: true,
            mapProfileToUser: (profile: {
              given_name?: string
              family_name?: string
              name?: string
            }) => {
              const parts = (profile.name ?? '').trim().split(/\s+/).filter(Boolean)
              const firstname = profile.given_name?.trim() || parts[0] || 'User'
              const lastname =
                profile.family_name?.trim() ||
                (parts.length > 1 ? parts.slice(1).join(' ') : firstname)

              return { firstname, lastname }
            },
          },
        },
      }
    : {}),

  // Block Better Auth from inserting users during OAuth when the email is not pre-provisioned.
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const email = user.email?.toLowerCase().trim()
          if (!email) {
            throw new APIError('BAD_REQUEST', { message: 'Invalid email.', code: 'INVALID_EMAIL' })
          }

          const state = await findUserAccountStateByEmail(email)
          if (!state) {
            throw new APIError('FORBIDDEN', {
              message: ACCOUNT_NOT_FOUND_MESSAGE,
              code: 'ACCOUNT_NOT_FOUND',
            })
          }

          assertUserCanAuthenticate(state)

          // User already exists (invite/admin/signup path). Abort duplicate insert.
          return false
        },
      },
    },
  },

  // App-layer guard: block suspended / deleted users at sign-in
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/sign-up/email') {
        throw new APIError('BAD_REQUEST', {
          message: 'Email signup requires OTP verification. Use the registration form.',
        })
      }

      if (ctx.path === '/request-password-reset' || ctx.path === '/forget-password') {
        const body = ctx.body as { email?: string }
        if (body.email) {
          const { rows: users } = await pool.query<{ id: string }>(
            `SELECT id FROM "users" WHERE "email" = $1 LIMIT 1`,
            [body.email.toLowerCase()]
          )

          if (users.length > 0) {
            const { rows: accounts } = await pool.query<{
              providerId: string
              password: string | null
            }>(`SELECT "providerId", "password" FROM "accounts" WHERE "userId" = $1`, [users[0].id])

            const hasCredential = accounts.some(
              (account) => account.providerId === 'credential' && Boolean(account.password)
            )

            if (!hasCredential) {
              throw new APIError('BAD_REQUEST', {
                message: 'This account uses Google sign-in. Please sign in with Google instead.',
                code: 'USE_GOOGLE_SIGN_IN',
              })
            }
          }
        }
      }

      if (ctx.path.startsWith('/callback/google') || ctx.path === '/sign-in/social') {
        const email =
          (ctx.query?.email as string | undefined) ||
          (ctx.body as { email?: string } | undefined)?.email
        if (email) {
          assertUserCanAuthenticate(await findUserAccountStateByEmail(email))
        }
        return
      }

      const signInPaths = ['/sign-in/email', '/sign-in/social']
      if (!signInPaths.includes(ctx.path)) return

      const { email } = ctx.body as { email?: string }
      if (!email) return

      assertUserCanAuthenticate(await findUserAccountStateByEmail(email))
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/reset-password') return

      const body = ctx.body as { token?: string }
      const query = ctx.query as { token?: string } | undefined
      const token = body.token ?? query?.token
      if (!token) return

      const tokenHash = createHash('sha256').update(token).digest('hex')

      await pool.query(
        `UPDATE "organization_invitations"
         SET "status" = 'accepted', "tokenHash" = NULL
         WHERE "tokenHash" = $1 AND "status" = 'pending'`,
        [tokenHash]
      )
    }),
  },

  plugins: [
    jwt({
      jwt: {
        issuer: accessTokenConfig.issuer,
        audience: accessTokenConfig.audience,
        expirationTime: accessTokenConfig.expirationTime,
        definePayload: async ({ user, session }) => {
          return accessTokenClaimsService.build({
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
            },
            session: {
              id: session.id,
              activeOrganizationId:
                (session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null,
            },
          })
        },
        getSubject: ({ user }) => user.id,
      },
    }),
  ],
})
