import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import { PLATFORM_PERMISSIONS, PRODUCT_PERMISSIONS, type Permission } from '#abilities/permissions'
import { SEEDED_ROLES } from '#abilities/role_seeds'

const ALL_PERMISSIONS: Permission[] = [...PRODUCT_PERMISSIONS, ...PLATFORM_PERMISSIONS]

/** Transaction-local GUC that unlocks owner/superadmin role_permissions mutations. */
const IMMUTABLE_ROLE_SYNC_GUC = 'app.allow_immutable_role_permission_sync'

/**
 * Populates the relational RBAC catalog: `roles`, `permissions`, `role_permissions`.
 *
 * `permissions.ts` (code) is still the source of truth for *which permission keys
 * exist* — this seeder is what turns that catalog into DB rows. Once seeded,
 * `role_permissions` is what `AuthorizationService` reads at request time
 * (including owner / superadmin — no in-memory short-circuit).
 *
 * Idempotent: safe to run on every deploy.
 * - roles: insert-if-missing
 * - permissions: upsert by name (module/action stay in sync with permissions.ts)
 * - role_permissions: full delete-then-insert per role, so removing a permission
 *   from a role's array here actually revokes it on re-seed (no drift/orphans)
 *
 * `owner` and `superadmin` catalogs are immutable except via this seeder
 * (DB triggers + `SET LOCAL` GUC). After syncing those roles, permissionVersion
 * is bumped for all holders so JWTs with embedded scopes remint.
 *
 * `organization_role_permissions` overrides are blocked for owner/superadmin
 * at the DB level.
 *
 * Note: renaming a permission key in permissions.ts leaves the old row orphaned;
 * manual clean up is required for old rows.
 */
export default class extends BaseSeeder {
  async run() {
    const rolePermissions: Record<string, Permission[]> = {
      superadmin: PLATFORM_PERMISSIONS,
      owner: PRODUCT_PERMISSIONS,
      admin: this.findSeededRole('admin'),
      agent: this.findSeededRole('agent'),
      viewer: this.findSeededRole('viewer'),
    }
    const roleNames = Object.keys(rolePermissions)

    await db.transaction(async (trx) => {
      // Unlock immutable owner/superadmin role_permissions for this transaction only.
      await trx.rawQuery(`SELECT set_config(?, 'on', true)`, [IMMUTABLE_ROLE_SYNC_GUC])

      // 1. Roles — insert any missing global roles (partial unique on name WHERE org IS NULL).
      for (const name of roleNames) {
        const existing = await trx
          .from('roles')
          .whereNull('organizationId')
          .where('name', name)
          .select('id')
          .first()
        if (!existing) {
          await trx.table('roles').insert({ name })
        }
      }

      const roleRows = await trx
        .from('roles')
        .whereNull('organizationId')
        .whereIn('name', roleNames)
        .select('id', 'name')
      const roleIdByName = new Map(roleRows.map((r) => [r.name as string, r.id as string]))

      // 2. Permissions — upsert so module/action stay in sync with permissions.ts.
      const permissionRows = ALL_PERMISSIONS.map((name) => {
        const [module, action] = this.splitPermission(name)
        return { name, module, action }
      })

      await trx
        .table('permissions')
        .multiInsert(permissionRows)
        .onConflict('name')
        .merge(['module', 'action'])

      const permissionFromDb = await trx
        .from('permissions')
        .whereIn('name', ALL_PERMISSIONS)
        .select('id', 'name')

      const permissionIdByName = new Map(
        permissionFromDb.map((p) => [p.name as string, p.id as string])
      )

      // 3. Role → permission mapping — delete-then-insert so revocations in code
      //    (removing a permission from a role's array) actually take effect on re-seed.
      for (const roleName of roleNames) {
        const roleId = roleIdByName.get(roleName)
        if (!roleId) throw new Error(`Seed failed: role "${roleName}" was not created`)

        await trx.from('role_permissions').where('roleId', roleId).delete()

        const rows = rolePermissions[roleName].map((permissionName) => {
          const permissionId = permissionIdByName.get(permissionName)
          if (!permissionId) {
            throw new Error(`Seed failed: permission "${permissionName}" was not created`)
          }
          return { roleId, permissionId }
        })

        if (rows.length > 0) {
          await trx.table('role_permissions').multiInsert(rows)
        }
      }

      // 4. Invalidate JWTs that embed owner/superadmin scopes after catalog sync.
      const ownerRoleId = roleIdByName.get('owner')
      const superadminRoleId = roleIdByName.get('superadmin')

      if (ownerRoleId) {
        await trx
          .from('organization_members')
          .where('roleId', ownerRoleId)
          .increment('permissionVersion', 1)
      }
      if (superadminRoleId) {
        await trx
          .from('user_roles')
          .where('roleId', superadminRoleId)
          .whereNull('organizationId')
          .increment('permissionVersion', 1)
      }
    })
  }

  private findSeededRole(role: string): Permission[] {
    const seeded = SEEDED_ROLES.find((s) => s.role === role)
    if (!seeded) throw new Error(`Seed failed: "${role}" is missing from SEEDED_ROLES`)
    return seeded.permissions
  }

  /** 'contacts:delete' -> ['contacts', 'delete'] */
  private splitPermission(permission: Permission): [string, string] {
    const [module, action] = permission.split(':')
    if (!module || !action) {
      throw new Error(`Seed failed: permission "${permission}" is not in "module:action" form`)
    }
    return [module, action]
  }
}
