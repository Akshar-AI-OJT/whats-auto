import db from '@adonisjs/lucid/services/db'
import { DEMO_USERS } from '#database/demo/credentials'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import DemoSeeder from '#database/seeders/demo_seeder'

/**
 * Clears JWKS (fresh JWT keys per run) and seeds demo fixtures only when missing.
 * Safe on shared staging DBs where demo data may already exist.
 */
export async function ensureDemoFixtures() {
  await db.from('jwks').delete()

  const owner = await db
    .from('users')
    .where('email', DEMO_USERS.northstarOwner)
    .select('id')
    .first()

  const org = await db
    .from('organizations')
    .where('id', FIXTURE_IDS.orgs.northstar)
    .select('id')
    .first()

  if (!owner || !org) {
    await new DemoSeeder(db.connection()).run()
  }
}
