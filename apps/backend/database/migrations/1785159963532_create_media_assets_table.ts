import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'media_assets'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.string('fileName', 255).notNullable()
      table.text('filePath').notNullable()
      table.string('mimeType', 255).notNullable() //image(jpg,png,jpeg,gif), text, video(ogv,webm, mp4, mkv etc)
      table.bigInteger('fileSize').notNullable()
      table.uuid('uploadedBy').nullable().references('users.id').onDelete('set null')
      table.timestamp('uploadedAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })

    this.schema.raw(`
      CREATE INDEX "media_assets_org_uploaded_at"
        ON "media_assets" ("organizationId", "uploadedAt" DESC)
    `)

    this.schema.raw('ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "media_assets" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "media_assets_tenant_isolation" ON "media_assets"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async down() {
    this.schema.raw(`DROP POLICY IF EXISTS "media_assets_tenant_isolation" ON "media_assets"`)
    this.schema.dropTable(this.tableName)
  }
}
