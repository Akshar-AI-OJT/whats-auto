import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'plans'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('code').nullable()
      table.text('description').nullable()
      table.integer('billingIntervalCount').notNullable().defaultTo(1)
      table.integer('trialDays').notNullable().defaultTo(0)
      table.text('gateway').nullable()
      table.text('gatewayPlanId').nullable()
      table.boolean('isActive').notNullable().defaultTo(true)
      table.integer('sortOrder').notNullable().defaultTo(0)
      table.jsonb('metadata').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
    })

    // Backfill unique codes from existing names before enforcing NOT NULL + UNIQUE.
    // Duplicate names (e.g. two "Starter" rows) must get distinct codes.
    this.schema.raw(`
      WITH ranked AS (
        SELECT
          id,
          NULLIF(
            trim(both '_' from lower(regexp_replace(trim("name"), '[^a-zA-Z0-9]+', '_', 'g'))),
            ''
          ) AS base_code,
          ROW_NUMBER() OVER (
            PARTITION BY
              NULLIF(
                trim(both '_' from lower(regexp_replace(trim("name"), '[^a-zA-Z0-9]+', '_', 'g'))),
                ''
              )
            ORDER BY "createdAt" ASC NULLS LAST, id ASC
          ) AS rn
        FROM "plans"
        WHERE "code" IS NULL
      )
      UPDATE "plans" AS p
      SET "code" = CASE
        WHEN r.base_code IS NULL THEN 'plan_' || substr(replace(r.id::text, '-', ''), 1, 8)
        WHEN r.rn = 1 THEN r.base_code
        ELSE r.base_code || '_' || substr(replace(r.id::text, '-', ''), 1, 8)
      END
      FROM ranked AS r
      WHERE p.id = r.id
    `)

    this.schema.raw(`
      ALTER TABLE "plans"
        ALTER COLUMN "code" SET NOT NULL
    `)

    this.schema.raw(`
      ALTER TABLE "plans"
        ADD CONSTRAINT "plans_billing_interval_count_positive"
        CHECK ("billingIntervalCount" >= 1),
        ADD CONSTRAINT "plans_trial_days_non_negative"
        CHECK ("trialDays" >= 0)
    `)

    this.schema.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS "plans_code_unique"
        ON "plans" ("code")
    `)

    this.schema.raw(`
      CREATE UNIQUE INDEX "plans_gateway_plan_id_unique"
        ON "plans" ("gateway", "gatewayPlanId")
        WHERE "gatewayPlanId" IS NOT NULL
    `)
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS "plans_gateway_plan_id_unique"`)
    this.schema.raw(`DROP INDEX IF EXISTS "plans_code_unique"`)
    this.schema.raw(`
      ALTER TABLE "plans"
        DROP CONSTRAINT IF EXISTS "plans_trial_days_non_negative",
        DROP CONSTRAINT IF EXISTS "plans_billing_interval_count_positive"
    `)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('metadata')
      table.dropColumn('sortOrder')
      table.dropColumn('isActive')
      table.dropColumn('gatewayPlanId')
      table.dropColumn('gateway')
      table.dropColumn('trialDays')
      table.dropColumn('billingIntervalCount')
      table.dropColumn('description')
      table.dropColumn('code')
    })
  }
}
