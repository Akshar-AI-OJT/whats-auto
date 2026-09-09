import { randomBytes, randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'

export type GrantSuperadminResult = {
  ok: boolean
  message: string
  level: 'success' | 'warning' | 'error'
}

function resolveEmail(email?: string): string | undefined {
  return email?.trim().toLowerCase()
}

/**
 * Create a fresh platform superadmin user (credential account + global grant).
 */
export async function bootstrapSuperadminUser(options: {
  email: string
  firstname?: string
  lastname?: string
}): Promise<GrantSuperadminResult> {
  const email = resolveEmail(options.email)
  if (!email) {
    return {
      ok: false,
      level: 'error',
      message: 'Pass email or set SUPERADMIN_EMAIL in the environment',
    }
  }

  const liveUser = await db
    .from('users')
    .whereRaw('LOWER(email) = ?', [email])
    .where('isDeleted', false)
    .select('id')
    .first()

  if (liveUser) {
    return {
      ok: false,
      level: 'error',
      message:
        `Cannot bootstrap superadmin: user "${email}" already exists. ` +
        'Run reset-superadmin to delete and recreate, or use grant-superadmin.',
    }
  }

  const superadminRole = await db
    .from('roles')
    .whereNull('organizationId')
    .where('name', 'superadmin')
    .select('id')
    .first()

  if (!superadminRole) {
    return {
      ok: false,
      level: 'error',
      message: 'Superadmin role missing — run rbac_seeder first',
    }
  }

  const firstname =
    options.firstname?.trim() || process.env.SUPERADMIN_FIRSTNAME?.trim() || 'Platform'
  const lastname = options.lastname?.trim() || process.env.SUPERADMIN_LASTNAME?.trim() || 'Admin'
  const name = `${firstname} ${lastname}`
  const randomPassword = randomBytes(32).toString('base64url')
  const passwordHash = await hash.make(randomPassword)
  const userId = randomUUID()

  await db.transaction(async (trx) => {
    await trx.table('users').insert({
      id: userId,
      name,
      firstname,
      lastname,
      email,
      emailVerified: true,
      isActive: true,
      isDeleted: false,
    })

    await trx.table('accounts').insert({
      userId,
      accountId: userId,
      providerId: 'credential',
      password: passwordHash,
    })

    await trx.table('user_roles').insert({
      userId,
      roleId: superadminRole.id as string,
      organizationId: null,
      permissionVersion: 1,
    })
  })

  return {
    ok: true,
    level: 'success',
    message: `Platform superadmin created for ${email}. Use Forgot Password on the login page to set your password.`,
  }
}

/**
 * Delete SUPERADMIN_EMAIL user (and org memberships) then bootstrap a fresh superadmin.
 */
export async function resetSuperadminUser(options: {
  email?: string
  firstname?: string
  lastname?: string
}): Promise<GrantSuperadminResult> {
  const email = resolveEmail(options.email ?? process.env.SUPERADMIN_EMAIL)
  if (!email) {
    return {
      ok: false,
      level: 'error',
      message: 'Pass email or set SUPERADMIN_EMAIL in the environment',
    }
  }

  const user = await db
    .from('users')
    .whereRaw('LOWER(email) = ?', [email])
    .select('id', 'isDeleted')
    .first()

  await db.transaction(async (trx) => {
    await trx.from('organization_invitations').whereRaw('LOWER(email) = ?', [email]).delete()

    if (user) {
      await trx.from('users').where('id', user.id).delete()
    }
  })

  const deleted = user ? `Deleted existing account for "${email}". ` : ''
  const bootstrap = await bootstrapSuperadminUser({
    email,
    firstname: options.firstname,
    lastname: options.lastname,
  })

  if (!bootstrap.ok) {
    return bootstrap
  }

  return {
    ok: true,
    level: 'success',
    message: `${deleted}${bootstrap.message}`,
  }
}

/**
 * Restore the global superadmin grant for an existing user.
 */
export async function grantSuperadminRole(options: {
  email?: string
  force?: boolean
}): Promise<GrantSuperadminResult> {
  const email = resolveEmail(options.email ?? process.env.SUPERADMIN_EMAIL)
  if (!email) {
    return {
      ok: false,
      level: 'error',
      message: 'Pass email or set SUPERADMIN_EMAIL in the environment',
    }
  }

  const user = await db
    .from('users')
    .whereRaw('LOWER(email) = ?', [email])
    .where('isDeleted', false)
    .select('id', 'email')
    .first()

  if (!user) {
    return { ok: false, level: 'error', message: `No active user found for "${email}"` }
  }

  const superadminRole = await db
    .from('roles')
    .whereNull('organizationId')
    .where('name', 'superadmin')
    .select('id')
    .first()

  if (!superadminRole) {
    return {
      ok: false,
      level: 'error',
      message: 'Superadmin role missing — run rbac_seeder first',
    }
  }

  const existingHolder = await db
    .from('user_roles as ur')
    .innerJoin('roles as r', 'r.id', 'ur.roleId')
    .innerJoin('users as u', 'u.id', 'ur.userId')
    .whereNull('ur.organizationId')
    .where('r.name', 'superadmin')
    .where('u.isDeleted', false)
    .select('ur.userId', 'u.email')
    .first()

  if (existingHolder && existingHolder.userId !== user.id) {
    if (!options.force) {
      return {
        ok: false,
        level: 'error',
        message:
          `Superadmin is already granted to "${existingHolder.email}". ` +
          'Pass --force to move the grant to the requested email.',
      }
    }

    await db
      .from('user_roles')
      .where('userId', existingHolder.userId)
      .whereNull('organizationId')
      .delete()
  }

  const globalGrant = await db
    .from('user_roles as ur')
    .innerJoin('roles as r', 'r.id', 'ur.roleId')
    .where('ur.userId', user.id)
    .whereNull('ur.organizationId')
    .select('ur.id', 'r.name', 'ur.permissionVersion')
    .first()

  if (globalGrant?.name === 'superadmin') {
    return {
      ok: true,
      level: 'success',
      message: `"${email}" already has the global superadmin role`,
    }
  }

  if (globalGrant) {
    await db
      .from('user_roles')
      .where('id', globalGrant.id)
      .update({
        roleId: superadminRole.id,
        permissionVersion: Number(globalGrant.permissionVersion) + 1,
      })

    return {
      ok: true,
      level: 'success',
      message: `Updated global grant for "${email}" from "${globalGrant.name}" to superadmin`,
    }
  }

  await db.table('user_roles').insert({
    userId: user.id,
    roleId: superadminRole.id,
    organizationId: null,
    permissionVersion: 1,
  })

  if (existingHolder && existingHolder.userId !== user.id) {
    return {
      ok: true,
      level: 'warning',
      message: `Revoked superadmin from "${existingHolder.email}" and granted global superadmin to "${email}"`,
    }
  }

  return {
    ok: true,
    level: 'success',
    message: `Granted global superadmin to "${email}"`,
  }
}
