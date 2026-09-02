import db from '@adonisjs/lucid/services/db'

export type GrantSuperadminResult = {
  ok: boolean
  message: string
  level: 'success' | 'warning' | 'error'
}

/**
 * Restore the global superadmin grant for an existing user.
 * Reads SUPERADMIN_EMAIL when email is omitted.
 */
export async function grantSuperadminRole(options: {
  email?: string
  force?: boolean
}): Promise<GrantSuperadminResult> {
  const email = options.email?.trim().toLowerCase()
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
