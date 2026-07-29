import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'organization_subscriptions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('planId').notNullable().references('plans.id').onDelete('restrict')
      table.text('status').notNullable() // trialing, active, past_due, cancelled
      table.timestamp('currentPeriodStart', { useTz: true }).notNullable()
      table.timestamp('currentPeriodEnd', { useTz: true }).notNullable()
      table.timestamp('cancelAt', { useTz: true }).nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      ALTER TABLE "organization_subscriptions"
        ADD CONSTRAINT "organization_subscriptions_period_valid"
        CHECK ("currentPeriodEnd" > "currentPeriodStart")
    `)

    this.schema.raw(`
      CREATE INDEX "organization_subscriptions_org_status"
        ON "organization_subscriptions" ("organizationId", "status")
    `)

    this.schema.raw(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "organization_subscriptions"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `)

    this.schema.raw('ALTER TABLE "organization_subscriptions" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "organization_subscriptions" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "organization_subscriptions_tenant_isolation"
        ON "organization_subscriptions"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(`
      DROP POLICY IF EXISTS "organization_subscriptions_tenant_isolation"
        ON "organization_subscriptions"
    `)
    this.schema.dropTable(this.tableName)
  }
}
