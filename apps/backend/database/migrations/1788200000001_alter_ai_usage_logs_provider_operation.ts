import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Add provider + operationType for cost telemetry.
 * Allow null conversationId for embedding / infra rows.
 * Expand decision CHECK for quota / summary / document decisions.
 */
export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`
      ALTER TABLE "ai_usage_logs"
        ADD COLUMN IF NOT EXISTS "provider" varchar(50) NOT NULL DEFAULT 'unknown',
        ADD COLUMN IF NOT EXISTS "operationType" varchar(50) NOT NULL DEFAULT 'rag_query'
    `)

    await this.db.rawQuery(`
      ALTER TABLE "ai_usage_logs"
        ALTER COLUMN "conversationId" DROP NOT NULL
    `)

    await this.db.rawQuery(`
      ALTER TABLE "ai_usage_logs"
        DROP CONSTRAINT IF EXISTS "ai_usage_logs_decision_check"
    `)

    await this.db.rawQuery(`
      ALTER TABLE "ai_usage_logs"
        ADD CONSTRAINT "ai_usage_logs_decision_check"
        CHECK ("decision" IN (
          'AUTO_REPLIED',
          'HANDOVER_LOW_CONFIDENCE',
          'HANDOVER_KEYWORD',
          'HANDOVER_ERROR',
          'RATE_LIMITED',
          'QUOTA_EXCEEDED',
          'CONVERSATION_SUMMARY',
          'DOCUMENT_INDEX',
          'DOCUMENT_REINDEX',
          'CACHE_HIT'
        ))
    `)

    await this.db.rawQuery(`
      CREATE INDEX IF NOT EXISTS "ai_usage_logs_org_provider_op_created"
        ON "ai_usage_logs" ("organizationId", "provider", "operationType", "createdAt" DESC)
    `)

    await this.db.rawQuery(`
      CREATE INDEX IF NOT EXISTS "ai_usage_logs_org_created_cost"
        ON "ai_usage_logs" ("organizationId", "createdAt" DESC)
    `)
  }

  async down() {
    await this.db.rawQuery(`DROP INDEX IF EXISTS "ai_usage_logs_org_created_cost"`)
    await this.db.rawQuery(`DROP INDEX IF EXISTS "ai_usage_logs_org_provider_op_created"`)

    await this.db.rawQuery(`
      ALTER TABLE "ai_usage_logs"
        DROP CONSTRAINT IF EXISTS "ai_usage_logs_decision_check"
    `)

    await this.db.rawQuery(`
      ALTER TABLE "ai_usage_logs"
        ADD CONSTRAINT "ai_usage_logs_decision_check"
        CHECK ("decision" IN (
          'AUTO_REPLIED',
          'HANDOVER_LOW_CONFIDENCE',
          'HANDOVER_KEYWORD',
          'HANDOVER_ERROR'
        ))
    `)

    await this.db.rawQuery(`
      ALTER TABLE "ai_usage_logs"
        ALTER COLUMN "conversationId" SET NOT NULL
    `)

    await this.db.rawQuery(`
      ALTER TABLE "ai_usage_logs"
        DROP COLUMN IF EXISTS "operationType",
        DROP COLUMN IF EXISTS "provider"
    `)
  }
}
