import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Converts leftover real[] embeddings (local DBs that applied the temporary
 * Phase 2 workaround) to pgvector. No-op when embedding is already vector.
 */
export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery('CREATE EXTENSION IF NOT EXISTS vector')

    await this.db.rawQuery(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'ai_knowledge_chunks'
            AND column_name = 'embedding'
            AND udt_name = '_float4'
        ) THEN
          ALTER TABLE "ai_knowledge_chunks"
            DROP CONSTRAINT IF EXISTS "ai_knowledge_chunks_embedding_dim";
          ALTER TABLE "ai_knowledge_chunks"
            ALTER COLUMN "embedding" TYPE vector(1536)
            USING "embedding"::vector(1536);
        END IF;
      END $$;
    `)

    await this.db.rawQuery(`
      CREATE INDEX IF NOT EXISTS "ai_knowledge_chunks_embedding"
        ON "ai_knowledge_chunks"
        USING hnsw ("embedding" vector_cosine_ops)
    `)
  }

  async down() {
    await this.db.rawQuery(`DROP INDEX IF EXISTS "ai_knowledge_chunks_embedding"`)
  }
}
