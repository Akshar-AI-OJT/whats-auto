import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import {
  PLATFORM_PERMISSIONS,
  PRODUCT_PERMISSIONS,
  type Permission,
} from '#abilities/permissions'
import { DEMO_PASSWORD, DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'
import RbacSeeder from '#database/seeders/rbac_seeder'
import { auth } from '#lib/auth'
import { formatScope } from '#lib/access_token_permissions'
import { AccessTokenClaimsService } from '#services/access_token_claims_service'
import { AuthorizationService } from '#services/authorization_service'

async function globalRoleId(name: string): Promise<string> {
  const row = await db.from('roles').whereNull('organizationId').where('name', name).select('id').first()
  if (!row?.id) throw new Error(`Missing global role ${name}`)
  return row.id as string
}

async function anyPermissionId(): Promise<string> {
  const row = await db.from('permissions').select('id').first()
  if (!row?.id) throw new Error('No permissions seeded')
  return row.id as string
}

test.group('immutable owner/superadmin RBAC', (group) => {
  group.setup(async () => {
    await db.from('jwks').delete()
    await new DemoSeeder(db.connection()).run()
  })

  test('resolvePermissions for owner equals seeded product catalog', async ({ assert }) => {
    const ownerRoleId = await globalRoleId('owner')
    const authz = new AuthorizationService()
    const set = await authz.resolvePermissions(FIXTURE_IDS.orgs.northstar, ownerRoleId)

    assert.equal(set.size, PRODUCT_PERMISSIONS.length)
    for (const perm of PRODUCT_PERMISSIONS) {
      assert.isTrue(set.has(perm), `missing ${perm}`)
    }
    assert.isFalse(set.has('platform:tenants_view' as Permission))
  })

  test('resolvePermissions for superadmin equals seeded platform catalog', async ({ assert }) => {
    const superadminRoleId = await globalRoleId('superadmin')
    const authz = new AuthorizationService()
    const set = await authz.resolvePermissions('', superadminRoleId)

    assert.equal(set.size, PLATFORM_PERMISSIONS.length)
    for (const perm of PLATFORM_PERMISSIONS) {
      assert.isTrue(set.has(perm), `missing ${perm}`)
    }
  })

  test('DB rejects role_permissions insert for owner without seeder GUC', async ({ assert }) => {
    const ownerRoleId = await globalRoleId('owner')
    const permissionId = await anyPermissionId()

    await assert.rejects(async () => {
      await db.table('role_permissions').insert({ roleId: ownerRoleId, permissionId })
    }, /immutable role/)
  })

  test('DB rejects role_permissions delete for superadmin without seeder GUC', async ({ assert }) => {
    const superadminRoleId = await globalRoleId('superadmin')
    const existing = await db
      .from('role_permissions')
      .where('roleId', superadminRoleId)
      .select('permissionId')
      .first()

    assert.exists(existing?.permissionId)

    await assert.rejects(async () => {
      await db
        .from('role_permissions')
        .where('roleId', superadminRoleId)
        .where('permissionId', existing!.permissionId)
        .delete()
    }, /immutable role/)
  })

  test('DB rejects organization_role_permissions override for owner', async ({ assert }) => {
    const ownerRoleId = await globalRoleId('owner')
    const permissionId = await anyPermissionId()

    await assert.rejects(async () => {
      await db.table('organization_role_permissions').insert({
        organizationId: FIXTURE_IDS.orgs.northstar,
        roleId: ownerRoleId,
        permissionId,
        granted: false,
      })
    }, /immutable role/)
  })

  test('DB rejects rename of global owner role', async ({ assert }) => {
    const ownerRoleId = await globalRoleId('owner')

    await assert.rejects(async () => {
      await db.from('roles').where('id', ownerRoleId).update({ name: 'owner_renamed' })
    }, /immutable system role/)
  })

  test('seeder GUC allows owner role_permissions resync and bumps permissionVersion', async ({
    assert,
  }) => {
    const ownerRoleId = await globalRoleId('owner')
    const superadminRoleId = await globalRoleId('superadmin')

    const ownerMemberBefore = await db
      .from('organization_members')
      .where('id', FIXTURE_IDS.members.northstarOwner)
      .select('permissionVersion')
      .first()
    const superadminGrantBefore = await db
      .from('user_roles')
      .where('id', FIXTURE_IDS.userRoles.superadmin)
      .select('permissionVersion')
      .first()

    assert.exists(ownerMemberBefore)
    assert.exists(superadminGrantBefore)

    await new RbacSeeder(db.connection()).run()

    const ownerMemberAfter = await db
      .from('organization_members')
      .where('id', FIXTURE_IDS.members.northstarOwner)
      .select('permissionVersion')
      .first()
    const superadminGrantAfter = await db
      .from('user_roles')
      .where('id', FIXTURE_IDS.userRoles.superadmin)
      .select('permissionVersion')
      .first()

    assert.isAbove(
      Number(ownerMemberAfter!.permissionVersion),
      Number(ownerMemberBefore!.permissionVersion)
    )
    assert.isAbove(
      Number(superadminGrantAfter!.permissionVersion),
      Number(superadminGrantBefore!.permissionVersion)
    )

    // Catalog still intact after resync
    const authz = new AuthorizationService()
    const ownerPerms = await authz.resolvePermissions(FIXTURE_IDS.orgs.northstar, ownerRoleId)
    const platformPerms = await authz.resolvePermissions('', superadminRoleId)
    assert.equal(ownerPerms.size, PRODUCT_PERMISSIONS.length)
    assert.equal(platformPerms.size, PLATFORM_PERMISSIONS.length)
  })

  test('owner JWT mints full sorted scope (no empty-scope expand)', async ({ assert }) => {
    const result = (await auth.api.signInEmail({
      body: { email: DEMO_USERS.northstarOwner, password: DEMO_PASSWORD },
    })) as { token?: string; user?: { id: string; name: string; email: string } }

    assert.exists(result.token)
    assert.exists(result.user?.id)

    const sessionRow = await db.from('sessions').where('token', result.token!).select('id').first()
    assert.exists(sessionRow?.id)

    await db
      .from('sessions')
      .where('id', sessionRow!.id)
      .update({ activeOrganizationId: FIXTURE_IDS.orgs.northstar })

    const payload = await new AccessTokenClaimsService().build({
      user: {
        id: result.user!.id,
        email: DEMO_USERS.northstarOwner,
        name: result.user!.name ?? DEMO_USERS.northstarOwner,
      },
      session: {
        id: sessionRow!.id as string,
        activeOrganizationId: FIXTURE_IDS.orgs.northstar,
      },
    })

    assert.equal(payload.role, 'owner')
    assert.isAbove((payload.scope ?? '').length, 0)
    assert.equal(payload.scope, formatScope(PRODUCT_PERMISSIONS))
    assert.notEqual(payload.scope, '')
  })

  test('superadmin JWT mints full platform scope', async ({ assert }) => {
    const result = (await auth.api.signInEmail({
      body: { email: DEMO_USERS.superadmin, password: DEMO_PASSWORD },
    })) as { token?: string; user?: { id: string; name: string; email: string } }

    assert.exists(result.token)
    assert.exists(result.user?.id)

    const sessionRow = await db.from('sessions').where('token', result.token!).select('id').first()
    assert.exists(sessionRow?.id)

    // Clear active org so claims use platform grant path
    await db.from('sessions').where('id', sessionRow!.id).update({ activeOrganizationId: null })

    const payload = await new AccessTokenClaimsService().build({
      user: {
        id: result.user!.id,
        email: DEMO_USERS.superadmin,
        name: result.user!.name ?? DEMO_USERS.superadmin,
      },
      session: { id: sessionRow!.id as string, activeOrganizationId: null },
    })

    assert.equal(payload.role, 'superadmin')
    assert.equal(payload.scope, formatScope(PLATFORM_PERMISSIONS))
  })
})
