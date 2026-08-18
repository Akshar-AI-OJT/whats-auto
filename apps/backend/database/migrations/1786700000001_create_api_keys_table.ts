import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Tenant API keys for public integration ingress.
 * Lookup before tenant bind uses resolve_api_key (SECURITY DEFINER).
 */
export default class extends BaseSchema {
  protected tableName = 'api_keys'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('createdByUserId').nullable().references('users.id').onDelete('set null')
      table.text('name').notNullable()
      table.text('keyPrefix').notNullable()
      table.text('keyHash').notNullable()
      table
        .specificType('scopes', 'text[]')
        .notNullable()
        .defaultTo(this.raw(`ARRAY['events:write']::text[]`))
      table.timestamp('lastUsedAt', { useTz: true }).nullable()
      table.timestamp('expiresAt', { useTz: true }).nullable()
      table.timestamp('revokedAt', { useTz: true }).nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
    })

    this.schema.raw(`
      CREATE UNIQUE INDEX "api_keys_key_hash_unique" ON "api_keys" ("keyHash")
    `)

    this.schema.raw(`
      CREATE INDEX "api_keys_org_id" ON "api_keys" ("organizationId")
    `)

    this.schema.raw('ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY')
    this.schema.raw('ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY')
    this.schema.raw(`
      CREATE POLICY "api_keys_tenant_isolation" ON "api_keys"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)

    this.schema.raw(`
      CREATE OR REPLACE FUNCTION resolve_api_key(p_key_hash text)
      RETURNS TABLE (
        id uuid,
        "organizationId" uuid,
        scopes text[],
        "revokedAt" timestamptz,
        "expiresAt" timestamptz
      )
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT k.id, k."organizationId", k.scopes, k."revokedAt", k."expiresAt"
        FROM api_keys k
        INNER JOIN organizations o ON o.id = k."organizationId"
        WHERE k."keyHash" = p_key_hash
          AND o."deletedAt" IS NULL
        LIMIT 1
      $$
    `)
  }

  async down() {
    this.schema.raw(`DROP FUNCTION IF EXISTS resolve_api_key(text)`)
    this.schema.raw(`DROP POLICY IF EXISTS "api_keys_tenant_isolation" ON "api_keys"`)
    this.schema.dropTable(this.tableName)
  }
}
