import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import { auth } from '#lib/auth'
import { DEMO_PASSWORD, DEMO_USERS, DEMO_EMAIL_DOMAIN } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import { daysAgo, daysFromNow, upsertById } from '#database/demo/helpers'
import type { DemoSeedModule } from '#database/demo/types'

type UserSeed = {
  key: keyof typeof FIXTURE_IDS.users
  email: string
  firstname: string
  lastname: string
  accountId: string
  googleAccountId?: string
}

const USER_SEEDS: UserSeed[] = [
  {
    key: 'superadmin',
    email: DEMO_USERS.superadmin,
    firstname: 'Platform',
    lastname: 'Superadmin',
    accountId: FIXTURE_IDS.accounts.superadminCredential,
  },
  {
    key: 'northstarOwner',
    email: DEMO_USERS.northstarOwner,
    firstname: 'Neha',
    lastname: 'Sharma',
    accountId: FIXTURE_IDS.accounts.northstarOwnerCredential,
    googleAccountId: FIXTURE_IDS.accounts.northstarOwnerGoogle,
  },
  {
    key: 'northstarAdmin',
    email: DEMO_USERS.northstarAdmin,
    firstname: 'Arjun',
    lastname: 'Mehta',
    accountId: FIXTURE_IDS.accounts.northstarAdminCredential,
  },
  {
    key: 'northstarAgent',
    email: DEMO_USERS.northstarAgent,
    firstname: 'Kavya',
    lastname: 'Iyer',
    accountId: FIXTURE_IDS.accounts.northstarAgentCredential,
  },
  {
    key: 'northstarViewer',
    email: DEMO_USERS.northstarViewer,
    firstname: 'Rohan',
    lastname: 'Desai',
    accountId: FIXTURE_IDS.accounts.northstarViewerCredential,
  },
  {
    key: 'northstarSupport',
    email: DEMO_USERS.northstarSupport,
    firstname: 'Meera',
    lastname: 'Nair',
    accountId: FIXTURE_IDS.accounts.northstarSupportCredential,
  },
  {
    key: 'harborOwner',
    email: DEMO_USERS.harborOwner,
    firstname: 'Alex',
    lastname: 'Morgan',
    accountId: FIXTURE_IDS.accounts.harborOwnerCredential,
  },
  {
    key: 'harborAdmin',
    email: DEMO_USERS.harborAdmin,
    firstname: 'Jordan',
    lastname: 'Lee',
    accountId: FIXTURE_IDS.accounts.harborAdminCredential,
  },
  {
    key: 'harborAgent',
    email: DEMO_USERS.harborAgent,
    firstname: 'Sam',
    lastname: 'Patel',
    accountId: FIXTURE_IDS.accounts.harborAgentCredential,
  },
  {
    key: 'harborViewer',
    email: DEMO_USERS.harborViewer,
    firstname: 'Casey',
    lastname: 'Brooks',
    accountId: FIXTURE_IDS.accounts.harborViewerCredential,
  },
]

export const identitiesModule: DemoSeedModule = {
  id: 'identities',
  ownedTables: ['users', 'accounts', 'sessions', 'jwks', 'verifications'],
  dependsOn: [],
  async seed(ctx) {
    // Ensure stable demo user IDs: remove prior @demo.whats-auto.test users (cascades accounts/sessions/memberships).
    // Organizations module recreates memberships on the same run.
    await db.from('users').whereILike('email', `%@${DEMO_EMAIL_DOMAIN}`).delete()

    const passwordHash = await hash.make(DEMO_PASSWORD)
    ctx.users = {}

    for (const seed of USER_SEEDS) {
      const userId = FIXTURE_IDS.users[seed.key]
      const name = `${seed.firstname} ${seed.lastname}`

      await upsertById('users', userId, {
        name,
        firstname: seed.firstname,
        lastname: seed.lastname,
        email: seed.email,
        emailVerified: true,
        isActive: true,
        isDeleted: false,
        deletedAt: null,
        image: null,
      })

      // Better Auth credential accounts use accountId = userId
      await upsertById('accounts', seed.accountId, {
        userId,
        accountId: userId,
        providerId: 'credential',
        password: passwordHash,
        accessToken: null,
        refreshToken: null,
        idToken: null,
        scope: null,
      })

      if (seed.googleAccountId) {
        await upsertById('accounts', seed.googleAccountId, {
          userId,
          accountId: `google-demo-${seed.key}`,
          providerId: 'google',
          password: null,
          accessToken: 'demo-google-access-token',
          refreshToken: 'demo-google-refresh-token',
          idToken: null,
          scope: 'openid email profile',
        })
      }

      ctx.users[seed.key] = userId
      ctx.users[seed.email] = userId
    }

    const demoUserIds = USER_SEEDS.map((s) => FIXTURE_IDS.users[s.key])
    await db.from('sessions').whereIn('userId', demoUserIds).delete()

    // Create sessions + JWKS via Better Auth. activeOrganizationId is set after orgs exist.
    let ownerSessionId: string | null = null

    for (const seed of USER_SEEDS) {
      const expectedUserId = FIXTURE_IDS.users[seed.key]

      let result: { token?: string; user?: { id: string } }
      try {
        result = (await auth.api.signInEmail({
          body: { email: seed.email, password: DEMO_PASSWORD },
        })) as { token?: string; user?: { id: string } }
      } catch (error) {
        throw new Error(
          `Demo seed: signInEmail threw for ${seed.email}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error }
        )
      }

      if (!result.token) {
        throw new Error(
          `Demo seed: signInEmail returned no token for ${seed.email}: ${JSON.stringify(result)}`
        )
      }

      const sessionRow = await db.from('sessions').where('token', result.token).select('id').first()
      if (!sessionRow?.id) {
        throw new Error(`Demo seed: no sessions row for token after sign-in of ${seed.email}`)
      }

      if (result.user?.id && result.user.id !== expectedUserId) {
        throw new Error(
          `Demo seed: sign-in user id ${result.user.id} !== stable fixture ${expectedUserId} for ${seed.email}`
        )
      }

      if (seed.key === 'northstarOwner') {
        ownerSessionId = sessionRow.id as string
      }
    }

    // Trigger Better Auth JWKS creation with a minimal payload (no org membership required yet).
    if (!ownerSessionId) {
      throw new Error('Demo seed: missing Northstar owner session for JWKS mint')
    }

    try {
      const signed = await auth.api.signJWT({
        body: {
          payload: {
            sub: FIXTURE_IDS.users.northstarOwner,
            sid: ownerSessionId,
            token_use: 'access',
            email: DEMO_USERS.northstarOwner,
            name: 'Neha Sharma',
            scope: '',
          },
        },
      })
      const token = (signed as { token?: string } | null)?.token
      if (!token) {
        throw new Error('signJWT returned no token')
      }
    } catch (error) {
      const jwksCount = await db.from('jwks').count('* as total').first()
      if (!jwksCount || Number(jwksCount.total) < 1) {
        throw new Error(
          `Demo seed: failed to create JWKS row: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error }
        )
      }
    }

    const jwksCount = await db.from('jwks').count('* as total').first()
    if (!jwksCount || Number(jwksCount.total) < 1) {
      throw new Error('Demo seed: expected at least one jwks row after JWT mint')
    }

    await upsertById('verifications', FIXTURE_IDS.verifications.resetActive, {
      identifier: `reset-password:${DEMO_USERS.northstarOwner}`,
      value: 'demo-active-reset-token',
      expiresAt: daysFromNow(1),
    })

    await upsertById('verifications', FIXTURE_IDS.verifications.resetExpired, {
      identifier: `reset-password:${DEMO_USERS.harborOwner}`,
      value: 'demo-expired-reset-token',
      expiresAt: daysAgo(2),
    })
  },
}
