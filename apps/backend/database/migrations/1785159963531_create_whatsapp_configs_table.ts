import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'whatsapp_configs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.text('phoneNumberId').notNullable()
      table.text('wabaId').nullable()
      table.text('accessToken').notNullable() // encrypted at app layer
      table.text('verifyToken').nullable()
      table.text('status').notNullable().defaultTo('disconnected') // connected, disconnected, error
      table.timestamp('connectedAt', { useTz: true }).nullable()
      table.timestamp('registeredAt', { useTz: true }).nullable()
      table.timestamp('subscribedAppsAt', { useTz: true }).nullable()
      table.uuid('createdByUserId').nullable().references('users.id').onDelete('set null')
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()

      table.unique(['phoneNumberId'], { indexName: 'whatsapp_configs_phone_number_id_unique' })
    })

    this.schema.raw(`
      CREATE INDEX "whatsapp_configs_org_status"
        ON "whatsapp_configs" ("organizationId", "status")
    `)

    this.schema.raw(`
      CREATE INDEX "whatsapp_configs_org_created_at"
        ON "whatsapp_configs" ("organizationId", "createdAt" DESC)
    `)

    this.schema.raw('ALTER TABLE "whatsapp_configs" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "whatsapp_configs" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "whatsapp_configs_tenant_isolation" ON "whatsapp_configs"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(
      `DROP POLICY IF EXISTS "whatsapp_configs_tenant_isolation" ON "whatsapp_configs"`
    )
    this.schema.dropTable(this.tableName)
  }
}
