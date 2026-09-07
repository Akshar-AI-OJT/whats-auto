import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Public landing-page product demos (not tenant-scoped).
 * Confirmed rows occupy a slot; cancelled rows free it.
 */
export default class extends BaseSchema {
  protected tableName = 'demo_bookings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.string('fullName', 200).notNullable()
      table.string('email', 254).notNullable()
      table.string('company', 255).nullable()
      table.string('phone', 40).nullable()
      table.string('companySize', 40).nullable()
      table.string('purpose', 40).nullable()
      table.timestamp('startsAt', { useTz: true }).notNullable()
      table.timestamp('endsAt', { useTz: true }).notNullable()
      table.string('timeZone', 100).notNullable()
      table.string('demoTimeZone', 100).notNullable()
      table.string('status', 20).notNullable().defaultTo('confirmed')
      table.text('meetingUrl').nullable()
      table.string('calendarEventId', 255).nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      CREATE UNIQUE INDEX "demo_bookings_confirmed_starts_at_unique"
        ON "demo_bookings" ("startsAt")
        WHERE "status" = 'confirmed'
    `)

    this.schema.raw(`
      CREATE INDEX "demo_bookings_email_created_at"
        ON "demo_bookings" ("email", "createdAt")
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
