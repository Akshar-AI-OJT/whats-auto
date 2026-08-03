import { BaseSeeder } from '@adonisjs/lucid/seeders'
import app from '@adonisjs/core/services/app'
import RbacSeeder from '#database/seeders/rbac_seeder'
import {
  DEMO_MODULES,
  assertRegistryCoverage,
  createDemoSeedContext,
} from '#database/demo/registry'

/**
 * Development/test demo fixtures for all application tables.
 *
 *   pnpm db:seed:demo
 *   # or: node ace db:seed --files=./database/seeders/demo_seeder.ts
 *
 * See demo_seed_plan.md for login cheat sheet and extension recipe.
 */
export default class extends BaseSeeder {
  static environment = ['development', 'test', 'testing']

  async run() {
    if (app.nodeEnvironment === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('Demo seeder refuses to run when NODE_ENV/app environment is production')
    }

    assertRegistryCoverage()

    const rbac = new RbacSeeder(this.client)
    await rbac.run()

    const ctx = createDemoSeedContext()
    for (const mod of DEMO_MODULES) {
      await mod.seed(ctx)
    }
  }
}
