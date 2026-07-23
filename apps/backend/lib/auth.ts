import { betterAuth } from 'better-auth'
import { createAuthMiddleware, APIError } from 'better-auth/api'
import { jwt } from 'better-auth/plugins'
import env from '#start/env'
import hash from '@adonisjs/core/services/hash'
import { pool } from '#lib/db'
import { resend } from '#lib/mail'
import { organization } from 'better-auth/plugins'
import { createAccessControl } from 'better-auth/plugins/access'
import { ALL_PERMISSIONS, toPermissionJson, toStoredPermissionJson } from '#abilities/permissions'
import { OrganizationService } from '#services/organization_service'
import { InvitationLifecycleService } from '#services/invitation_lifecycle_service'

const googleClientId = env.get('GOOGLE_CLIENT_ID')
const googleClientSecret = env.get('GOOGLE_CLIENT_SECRET')
const hasGoogle = Boolean(googleClientId) && Boolean(googleClientSecret)

const ac = createAccessControl({
  // Better-Auth org invite endpoints check invitation:create|cancel
  invitation: ['create', 'cancel'],
  ...toPermissionJson(ALL_PERMISSIONS),
})

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

  // Google OAuth (only when credentials are present)
  ...(hasGoogle
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId!,
            clientSecret: googleClientSecret!.release(),
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
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/organization/create' && ctx.context?.returned) {
        const org = ctx.context.returned as { id?: string }
        if (org?.id) {
          const svc = new OrganizationService()
          await svc.seedDefaultRoles(org.id)
        }
      }
    }),
  },

  plugins: [
    // JWT — signs short-lived access tokens for AdonisJS API calls
    jwt(),
    // custom RBAC for product gates; BA for membership + invites + active org.
    // dynamicAccessControl lets BA resolve invite roles from organization_roles.
    organization({
      creatorRole: 'owner',
      allowRoleCreation: false,
      dynamicAccessControl: { enabled: true },
      keepMemberActiveOrganizationOnSetActive: true,
      schema: {
        organization: {
          modelName: 'organizations',
        },
        member: {
          modelName: 'organization_members',
        },
        invitation: {
          modelName: 'organization_invitations',
        },
        organizationRole: {
          modelName: 'organization_roles',
          additionalFields: {
            displayName: { type: 'string', required: true, input: true },
          },
        },
      },
      ac,
      roles: {
        owner: ac.newRole({ ...toStoredPermissionJson(ALL_PERMISSIONS) }),
      },
      organizationHooks: {
        beforeCreateInvitation: async ({ invitation, inviter, organization: org }) => {
          const inviterUserId =
            (inviter as { id?: string; user?: { id?: string } }).user?.id ??
            (inviter as { id?: string }).id
          if (!inviterUserId || !org?.id || !invitation.role) {
            throw new APIError('BAD_REQUEST', { message: 'Invalid invitation payload' })
          }
          const lifecycle = new InvitationLifecycleService()
          await lifecycle.assertInviteAllowed({
            organizationId: org.id,
            inviterUserId,
            role: String(invitation.role),
          })
          return { data: invitation }
        },
        beforeAcceptInvitation: async ({ invitation, organization: org }) => {
          if (!org?.id || !invitation.role) {
            throw new APIError('BAD_REQUEST', { message: 'Invalid invitation' })
          }
          const lifecycle = new InvitationLifecycleService()
          await lifecycle.assertAcceptableRole({
            organizationId: org.id,
            role: String(invitation.role),
          })
        },
      },

      async sendInvitationEmail({ email, inviter, organization: org, role, invitation }) {
        const inviteLink = `${env.get('APP_URL')}/accept-invitation/${invitation.id}`
        const { error } = await resend.emails.send({
          from: env.get('EMAIL_FROM'),
          to: email,
          subject: `You've been invited to ${org.name}`,
          html: `
            <p>${inviter.user.name} invited you to join <strong>${org.name}</strong> as <strong>${role}</strong>.</p>
            <p><a href="${inviteLink}">Accept Invitation</a> — link expires in 48 hours.</p>
          `,
        })
        if (error) throw new Error(`Failed to send invite email: ${error.message}`)
      },
    }),
  ],
})
