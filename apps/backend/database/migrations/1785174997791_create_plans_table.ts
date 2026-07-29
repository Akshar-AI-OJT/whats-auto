import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'plans'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.text('name').notNullable()
      table.decimal('price', 18, 2).notNullable()
      table.string('currency', 20).notNullable()
      table.text('billingInterval').notNullable()
      table.jsonb('limits').notNullable().defaultTo(this.raw(`'{}'::jsonb`))
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      ALTER TABLE "plans"
        ADD CONSTRAINT "plans_price_non_negative"
        CHECK ("price" >= 0)
    `)
    this.schema.raw(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "plans"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
