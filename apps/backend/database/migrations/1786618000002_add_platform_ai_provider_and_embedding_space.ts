import { BaseSchema } from '@adonisjs/lucid/schema'

const DEFAULT_SPACE = 'openai:text-embedding-3-small:1024:v1'

/**
 * D20 Phase 1: provider/model columns on platform_ai_configs and
 * embeddingSpaceId on ai_knowledge_chunks. Vector resize to 1024 is
 * 1786618000001 (empty-table preflight).
 */
export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`
      ALTER TABLE "platform_ai_configs"
        ADD COLUMN IF NOT EXISTS "chatProvider" varchar(20) NOT NULL DEFAULT 'openai',
        ADD COLUMN IF NOT EXISTS "chatModel" varchar(100) NULL,
        ADD COLUMN IF NOT EXISTS "summaryModel" varchar(100) NULL,
        ADD COLUMN IF NOT EXISTS "embeddingProvider" varchar(20) NOT NULL DEFAULT 'openai',
        ADD COLUMN IF NOT EXISTS "activeEmbeddingSpaceId" varchar(160) NOT NULL DEFAULT '${DEFAULT_SPACE}',
        ADD COLUMN IF NOT EXISTS "maxOutputTokens" integer NOT NULL DEFAULT 1024
    `)

    await this.db.rawQuery(`
      UPDATE "platform_ai_configs"
      SET "chatModel" = COALESCE("chatModel", "modelName"),
          "embeddingProvider" = "chatProvider"
    `)

    await this.db.rawQuery(`
      ALTER TABLE "platform_ai_configs"
        ALTER COLUMN "chatModel" SET NOT NULL,
        ALTER COLUMN "chatModel" SET DEFAULT 'gpt-4o-mini'
    `)

    await this.db.rawQuery(`
      ALTER TABLE "platform_ai_configs"
        DROP CONSTRAINT IF EXISTS "platform_ai_configs_chat_provider_check"
    `)
    await this.db.rawQuery(`
      ALTER TABLE "platform_ai_configs"
        ADD CONSTRAINT "platform_ai_configs_chat_provider_check"
        CHECK ("chatProvider" IN ('openai', 'google', 'mistral'))
    `)

    await this.db.rawQuery(`
      ALTER TABLE "platform_ai_configs"
        DROP CONSTRAINT IF EXISTS "platform_ai_configs_embedding_provider_check"
    `)
    await this.db.rawQuery(`
      ALTER TABLE "platform_ai_configs"
        ADD CONSTRAINT "platform_ai_configs_embedding_provider_check"
        CHECK ("embeddingProvider" IN ('openai', 'google', 'mistral'))
    `)

    await this.db.rawQuery(`
      ALTER TABLE "ai_knowledge_chunks"
        ADD COLUMN IF NOT EXISTS "embeddingSpaceId" varchar(160) NOT NULL DEFAULT '${DEFAULT_SPACE}'
    `)

    await this.db.rawQuery(`
      CREATE INDEX IF NOT EXISTS "ai_knowledge_chunks_org_space"
        ON "ai_knowledge_chunks" ("organizationId", "embeddingSpaceId")
    `)
  }

  async down() {
    await this.db.rawQuery(`DROP INDEX IF EXISTS "ai_knowledge_chunks_org_space"`)
    await this.db.rawQuery(`
      ALTER TABLE "ai_knowledge_chunks"
        DROP COLUMN IF EXISTS "embeddingSpaceId"
    `)
    await this.db.rawQuery(`
      ALTER TABLE "platform_ai_configs"
        DROP CONSTRAINT IF EXISTS "platform_ai_configs_chat_provider_check"
    `)
    await this.db.rawQuery(`
      ALTER TABLE "platform_ai_configs"
        DROP CONSTRAINT IF EXISTS "platform_ai_configs_embedding_provider_check"
    `)
    await this.db.rawQuery(`
      ALTER TABLE "platform_ai_configs"
        DROP COLUMN IF EXISTS "maxOutputTokens",
        DROP COLUMN IF EXISTS "activeEmbeddingSpaceId",
        DROP COLUMN IF EXISTS "embeddingProvider",
        DROP COLUMN IF EXISTS "summaryModel",
        DROP COLUMN IF EXISTS "chatModel",
        DROP COLUMN IF EXISTS "chatProvider"
    `)
  }
}
