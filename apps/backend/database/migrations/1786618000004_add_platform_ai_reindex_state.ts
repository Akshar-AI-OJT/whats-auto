import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * D20 Phase 7: pending embed-identity on platform_ai_configs, plus
 * SECURITY DEFINER helpers so the reindex worker can list INDEXED
 * documents and GC a space despite FORCE RLS.
 */
export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`
      ALTER TABLE "platform_ai_configs"
        ADD COLUMN IF NOT EXISTS "reindexStatus" varchar(20) NOT NULL DEFAULT 'idle',
        ADD COLUMN IF NOT EXISTS "reindexFromSpaceId" varchar(160) NULL,
        ADD COLUMN IF NOT EXISTS "reindexToSpaceId" varchar(160) NULL,
        ADD COLUMN IF NOT EXISTS "reindexEmbeddingModel" varchar(100) NULL,
        ADD COLUMN IF NOT EXISTS "reindexEmbeddingProvider" varchar(20) NULL
    `)

    await this.db.rawQuery(`
      ALTER TABLE "platform_ai_configs"
        DROP CONSTRAINT IF EXISTS "platform_ai_configs_reindex_status_check"
    `)
    await this.db.rawQuery(`
      ALTER TABLE "platform_ai_configs"
        ADD CONSTRAINT "platform_ai_configs_reindex_status_check"
        CHECK ("reindexStatus" IN ('idle', 'running', 'failed'))
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

    await this.db.rawQuery(`
      CREATE OR REPLACE FUNCTION delete_ai_knowledge_chunks_in_space(p_space_id text)
      RETURNS bigint
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public
      AS $$
        WITH deleted AS (
          DELETE FROM ai_knowledge_chunks
          WHERE "embeddingSpaceId" = p_space_id
          RETURNING 1
        )
        SELECT COUNT(*)::bigint FROM deleted
      $$
    `)
  }

  async down() {
    await this.db.rawQuery(`DROP FUNCTION IF EXISTS delete_ai_knowledge_chunks_in_space(text)`)
    await this.db.rawQuery(
      `DROP FUNCTION IF EXISTS list_ai_knowledge_documents_missing_space(text)`
    )
    await this.db.rawQuery(`DROP FUNCTION IF EXISTS list_ai_knowledge_documents_for_reindex()`)
    await this.db.rawQuery(`
      ALTER TABLE "platform_ai_configs"
        DROP CONSTRAINT IF EXISTS "platform_ai_configs_reindex_status_check"
    `)
    await this.db.rawQuery(`
      ALTER TABLE "platform_ai_configs"
        DROP COLUMN IF EXISTS "reindexEmbeddingProvider",
        DROP COLUMN IF EXISTS "reindexEmbeddingModel",
        DROP COLUMN IF EXISTS "reindexToSpaceId",
        DROP COLUMN IF EXISTS "reindexFromSpaceId",
        DROP COLUMN IF EXISTS "reindexStatus"
    `)
  }
}
