import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * AI conversation engine tables + conversation AI columns.
 * Tenant tables use organizationId RLS. platform_ai_configs is a singleton
 * with no tenant column (superadmin-managed).
 * Requires the pgvector `vector` extension.
 */
export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery('CREATE EXTENSION IF NOT EXISTS vector')

    await this.db.rawQuery(`
      CREATE TABLE "platform_ai_configs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "singletonKey" text NOT NULL DEFAULT 'default',
        "isEnabled" boolean NOT NULL DEFAULT true,
        "modelName" varchar(100) NOT NULL DEFAULT 'gpt-4o-mini',
        "temperature" numeric(3,2) NOT NULL DEFAULT 0.20,
        "campaignAttributionWindowHours" integer NOT NULL DEFAULT 48,
        "minConfidenceScore" numeric(3,2) NOT NULL DEFAULT 0.70,
        "debounceDelaySeconds" integer NOT NULL DEFAULT 4,
        "systemPrompt" text NULL,
        "handoverKeywords" jsonb NOT NULL DEFAULT '["agent","human","representative","support","call me"]'::jsonb,
        "workingSetSize" integer NOT NULL DEFAULT 6,
        "summaryTurnThreshold" integer NOT NULL DEFAULT 10,
        "embeddingModel" varchar(100) NOT NULL DEFAULT 'text-embedding-3-small',
        "updatedByUserId" uuid NULL REFERENCES "users" ("id") ON DELETE SET NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NULL,
        CONSTRAINT "platform_ai_configs_singleton_key_unique" UNIQUE ("singletonKey"),
        CONSTRAINT "platform_ai_configs_singleton_key_default" CHECK ("singletonKey" = 'default')
      )
    `)

    await this.db.rawQuery(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "platform_ai_configs"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `)

    await this.db.rawQuery(`
      INSERT INTO "platform_ai_configs" ("singletonKey")
      VALUES ('default')
      ON CONFLICT ("singletonKey") DO NOTHING
    `)

    await this.db.rawQuery(`
      CREATE TABLE "ai_knowledge_documents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organizationId" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
        "mediaAssetId" uuid NULL REFERENCES "media_assets" ("id") ON DELETE SET NULL,
        "title" varchar(255) NOT NULL,
        "sourceType" varchar(50) NOT NULL,
        "status" varchar(50) NOT NULL DEFAULT 'PENDING',
        "chunkCount" integer NOT NULL DEFAULT 0,
        "embeddingModel" varchar(100) NOT NULL DEFAULT 'text-embedding-3-small',
        "documentHash" varchar(64) NULL,
        "errorMessage" text NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NULL,
        CONSTRAINT "ai_knowledge_documents_source_type_check"
          CHECK ("sourceType" IN ('FILE_PDF', 'FILE_DOCX', 'FILE_TXT')),
        CONSTRAINT "ai_knowledge_documents_status_check"
          CHECK ("status" IN ('PENDING', 'PROCESSING', 'INDEXED', 'FAILED'))
      )
    `)

    await this.db.rawQuery(`
      CREATE INDEX "ai_knowledge_documents_org_status"
        ON "ai_knowledge_documents" ("organizationId", "status", "createdAt" DESC)
    `)

    await this.db.rawQuery(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "ai_knowledge_documents"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `)

    await this.#enableTenantRls('ai_knowledge_documents')

    await this.db.rawQuery(`
      CREATE TABLE "ai_knowledge_chunks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organizationId" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
        "documentId" uuid NOT NULL REFERENCES "ai_knowledge_documents" ("id") ON DELETE CASCADE,
        "chunkIndex" integer NOT NULL,
        "contentHash" varchar(64) NOT NULL,
        "content" text NOT NULL,
        "metadata" jsonb NULL,
        "embedding" vector(1536) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NULL
      )
    `)

    await this.db.rawQuery(`
      CREATE INDEX "ai_knowledge_chunks_document_hash"
        ON "ai_knowledge_chunks" ("documentId", "contentHash")
    `)

    await this.db.rawQuery(`
      CREATE INDEX "ai_knowledge_chunks_org_document"
        ON "ai_knowledge_chunks" ("organizationId", "documentId")
    `)

    await this.db.rawQuery(`
      CREATE INDEX "ai_knowledge_chunks_embedding"
        ON "ai_knowledge_chunks"
        USING hnsw ("embedding" vector_cosine_ops)
    `)

    await this.db.rawQuery(`
      CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON "ai_knowledge_chunks"
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `)

    await this.#enableTenantRls('ai_knowledge_chunks')

    await this.db.rawQuery(`
      CREATE TABLE "ai_usage_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organizationId" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
        "conversationId" uuid NOT NULL REFERENCES "conversations" ("id") ON DELETE CASCADE,
        "messageId" uuid NULL REFERENCES "messages" ("id") ON DELETE SET NULL,
        "promptTokens" integer NOT NULL DEFAULT 0,
        "completionTokens" integer NOT NULL DEFAULT 0,
        "totalTokens" integer NOT NULL DEFAULT 0,
        "estimatedCostUsd" numeric(10,6) NOT NULL DEFAULT 0,
        "modelName" varchar(100) NOT NULL,
        "latencyMs" integer NOT NULL,
        "decision" varchar(50) NOT NULL,
        "retrievalScore" numeric(3,2) NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ai_usage_logs_decision_check"
          CHECK ("decision" IN (
            'AUTO_REPLIED',
            'HANDOVER_LOW_CONFIDENCE',
            'HANDOVER_KEYWORD',
            'HANDOVER_ERROR'
          ))
      )
    `)

    await this.db.rawQuery(`
      CREATE INDEX "ai_usage_logs_org_conversation_created"
        ON "ai_usage_logs" ("organizationId", "conversationId", "createdAt" DESC)
    `)

    await this.#enableTenantRls('ai_usage_logs')

    await this.db.rawQuery(`
      ALTER TABLE "conversations"
        ADD COLUMN "aiMode" text NOT NULL DEFAULT 'AI_AUTO',
        ADD COLUMN "aiSummary" text NULL,
        ADD COLUMN "attributedCampaignId" uuid NULL
          REFERENCES "broadcasts" ("id") ON DELETE SET NULL,
        ADD COLUMN "aiHandoverReason" text NULL
    `)

    await this.db.rawQuery(`
      ALTER TABLE "conversations"
        ADD CONSTRAINT "conversations_ai_mode_check"
        CHECK ("aiMode" IN ('AI_AUTO', 'HANDOVER', 'HUMAN_ACTIVE'))
    `)

    await this.db.rawQuery(`
      CREATE INDEX "conversations_org_ai_mode"
        ON "conversations" ("organizationId", "aiMode")
    `)

    await this.db.rawQuery(`
      CREATE INDEX "conversations_org_attributed_campaign"
        ON "conversations" ("organizationId", "attributedCampaignId")
        WHERE "attributedCampaignId" IS NOT NULL
    `)
  }

  async down() {
    await this.db.rawQuery(`DROP INDEX IF EXISTS "conversations_org_attributed_campaign"`)
    await this.db.rawQuery(`DROP INDEX IF EXISTS "conversations_org_ai_mode"`)
    await this.db.rawQuery(`
      ALTER TABLE "conversations"
        DROP CONSTRAINT IF EXISTS "conversations_ai_mode_check",
        DROP COLUMN IF EXISTS "aiHandoverReason",
        DROP COLUMN IF EXISTS "attributedCampaignId",
        DROP COLUMN IF EXISTS "aiSummary",
        DROP COLUMN IF EXISTS "aiMode"
    `)

    await this.#dropTenantRls('ai_usage_logs')
    await this.db.rawQuery(`DROP TABLE IF EXISTS "ai_usage_logs"`)

    await this.#dropTenantRls('ai_knowledge_chunks')
    await this.db.rawQuery(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "ai_knowledge_chunks"`)
    await this.db.rawQuery(`DROP TABLE IF EXISTS "ai_knowledge_chunks"`)

    await this.#dropTenantRls('ai_knowledge_documents')
    await this.db.rawQuery(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "ai_knowledge_documents"`)
    await this.db.rawQuery(`DROP TABLE IF EXISTS "ai_knowledge_documents"`)

    await this.db.rawQuery(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "platform_ai_configs"`)
    await this.db.rawQuery(`DROP TABLE IF EXISTS "platform_ai_configs"`)
  }

  async #enableTenantRls(tableName: string) {
    await this.db.rawQuery(`ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY`)
    await this.db.rawQuery(`ALTER TABLE "${tableName}" FORCE ROW LEVEL SECURITY`)
    await this.db.rawQuery(`
      CREATE POLICY "${tableName}_tenant_isolation" ON "${tableName}"
        USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    `)
  }

  async #dropTenantRls(tableName: string) {
    await this.db.rawQuery(
      `DROP POLICY IF EXISTS "${tableName}_tenant_isolation" ON "${tableName}"`
    )
  }
}
