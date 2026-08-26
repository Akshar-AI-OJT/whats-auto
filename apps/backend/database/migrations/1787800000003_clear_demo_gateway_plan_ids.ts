import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Orders API does not use Razorpay plan catalog ids.
 * Clears fake seed values so they cannot be treated as live gateway plans.
 */
export default class extends BaseSchema {
  protected tableName = 'plans'

  async up() {
    await this.db.from(this.tableName).whereILike('gatewayPlanId', 'plan_demo_%').update({
      gatewayPlanId: null,
      gateway: null,
    })
  }

  async down() {
    // Irreversible data cleanup — demo seeds re-apply on next seed.
  }
}
