import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Soft-delete lifecycle for knowledge documents (Media Library–style).
 * deletedAt marks trash; original status is preserved for restore + retrieval gating.
 */
export default class extends BaseSchema {
  protected tableName = 'ai_knowledge_documents'

  async up() {
    await this.db.rawQuery(`
      ALTER TABLE "ai_knowledge_documents"
        ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz NULL
    `)

    await this.db.rawQuery(`
      CREATE INDEX IF NOT EXISTS "ai_knowledge_documents_org_deleted"
        ON "ai_knowledge_documents" ("organizationId", "deletedAt", "createdAt" DESC)
    `)

    await this.db.rawQuery(`
      CREATE OR REPLACE FUNCTION list_ai_knowledge_documents_for_reindex()
      RETURNS TABLE("organizationId" uuid, id uuid)
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT d."organizationId", d.id
        FROM ai_knowledge_documents d
        WHERE d.status = 'INDEXED'
          AND d."deletedAt" IS NULL
      $$
    `)

    await this.db.rawQuery(`
      CREATE OR REPLACE FUNCTION list_ai_knowledge_documents_missing_space(p_space_id text)
      RETURNS TABLE("organizationId" uuid, id uuid)
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT d."organizationId", d.id
        FROM ai_knowledge_documents d
        WHERE d.status = 'INDEXED'
          AND d."deletedAt" IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM ai_knowledge_chunks c
            WHERE c."documentId" = d.id
              AND c."embeddingSpaceId" = p_space_id
          )
      $$
    `)
  }

  async down() {
    await this.db.rawQuery(`
      CREATE OR REPLACE FUNCTION list_ai_knowledge_documents_for_reindex()
      RETURNS TABLE("organizationId" uuid, id uuid)
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT d."organizationId", d.id
        FROM ai_knowledge_documents d
        WHERE d.status = 'INDEXED'
      $$
    `)

    await this.db.rawQuery(`
      CREATE OR REPLACE FUNCTION list_ai_knowledge_documents_missing_space(p_space_id text)
      RETURNS TABLE("organizationId" uuid, id uuid)
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT d."organizationId", d.id
        FROM ai_knowledge_documents d
        WHERE d.status = 'INDEXED'
          AND NOT EXISTS (
            SELECT 1
            FROM ai_knowledge_chunks c
            WHERE c."documentId" = d.id
              AND c."embeddingSpaceId" = p_space_id
          )
      $$
    `)

    await this.db.rawQuery(`DROP INDEX IF EXISTS "ai_knowledge_documents_org_deleted"`)
    await this.db.rawQuery(`
      ALTER TABLE "ai_knowledge_documents"
        DROP COLUMN IF EXISTS "deletedAt"
    `)
  }
}
