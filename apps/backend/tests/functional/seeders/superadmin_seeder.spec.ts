import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import RbacSeeder from '#database/seeders/rbac_seeder'
import SuperadminSeeder from '#database/seeders/superadmin_seeder'

const TEST_EMAIL = 'platform-admin-bootstrap@test.whats-auto.local'

async function runRbacSeeder() {
  const seeder = new RbacSeeder(db.connection())
  await seeder.run()
}

async function runSuperadminSeeder() {
  const seeder = new SuperadminSeeder(db.connection())
  await seeder.run()
}

async function deleteBootstrapUser(email: string) {
  const user = await db.from('users').where('email', email).select('id').first()
  if (!user) return

  await db.from('user_roles').where('userId', user.id).delete()
  await db.from('accounts').where('userId', user.id).delete()
  await db.from('users').where('id', user.id).delete()
}

async function deleteGlobalSuperadminGrants() {
  await db.rawQuery(`
    DELETE FROM user_roles ur
    USING roles r
    WHERE ur."roleId" = r.id
      AND ur."organizationId" IS NULL
      AND r.name = 'superadmin'
  `)
}

test.group('Superadmin seeder', (group) => {
  group.each.setup(async () => {
    process.env.SUPERADMIN_EMAIL = TEST_EMAIL
    await deleteGlobalSuperadminGrants()
    await deleteBootstrapUser(TEST_EMAIL)
  })

  group.each.teardown(async () => {
    await deleteBootstrapUser(TEST_EMAIL)
    delete process.env.SUPERADMIN_EMAIL
  })

  test('creates credential user with global superadmin grant after rbac', async ({ assert }) => {
    await runRbacSeeder()
    await runSuperadminSeeder()

    const user = await db.from('users').where('email', TEST_EMAIL).first()
    assert.exists(user)
    assert.isTrue(user!.emailVerified)
    assert.isTrue(user!.isActive)

    const account = await db
      .from('accounts')
      .where('userId', user!.id)
      .where('providerId', 'credential')
      .first()
    assert.exists(account)
    assert.isString(account!.password)

    const grant = await db
      .from('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.roleId')
      .where('ur.userId', user!.id)
      .whereNull('ur.organizationId')
      .where('r.name', 'superadmin')
      .first()
    assert.exists(grant)
  })

  test('is idempotent when global superadmin already exists', async ({ assert }) => {
    await runRbacSeeder()
    await runSuperadminSeeder()
    await runSuperadminSeeder()

    const count = await db
      .from('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.roleId')
      .whereNull('ur.organizationId')
      .where('r.name', 'superadmin')
      .count('* as total')
      .first()

    assert.equal(Number(count?.total), 1)
  })
})
