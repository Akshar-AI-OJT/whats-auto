import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import { PLATFORM_PERMISSIONS, PRODUCT_PERMISSIONS, type Permission } from '#abilities/permissions'
import { SEEDED_ROLES } from '#abilities/role_seeds'

const ALL_PERMISSIONS: Permission[] = [...PRODUCT_PERMISSIONS, ...PLATFORM_PERMISSIONS]
/**
 * Populates the relational RBAC catalog: `roles`, `permissions`, `role_permissions`.
 *
 * `permissions.ts` (code) is still the source of truth for *which permission keys
 * exist* — this seeder is what turns that catalog into DB rows. Once seeded,
 * `role_permissions`  is what `AuthorizationService` reads at request time.
 *
 * Idempotent: safe to run on every deploy.
 * - roles: insert-if-missing
 * - permissions: upsert by name (module/action stay in sync with permissions.ts)
 * - role_permissions: full delete-then-insert per role, so removing a permission
 *   from a role's array here actually revokes it on re-seed (no drift/orphans)
 *
 * `owner` and `superadmin` are seeded with the full permission catalog for
 * completeness/consistency, even though `AuthorizationService` short-circuits
 * both roles without querying `role_permissions`. `organization_role_permissions`
 * overrides are blocked for both roles at the DB level
 * Note: renaming a permission key in permission.ts leaves the old row orphaned in permission.ts
 * manual clean up is required for old rows
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
      // 1. Roles — insert any missing, never overwrite an existing row.
      await trx
        .table('roles')
        .multiInsert(roleNames.map((name) => ({ name })))
        .onConflict('name')
        .ignore()

      const roleRows = await trx.from('roles').whereIn('name', roleNames).select('id', 'name')
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
