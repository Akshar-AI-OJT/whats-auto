import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Spike / Mistral test branch: store mistral-embed native 1024-d vectors.
 * Assumes ai_knowledge_chunks is empty (or truncatable). Do not use cast truncation
 * as a semantic migration of live 1536-d production vectors.
 */
export default class extends BaseSchema {
  async up() {
    const count = await this.db.from('ai_knowledge_chunks').count('* as total').first()
    const total = Number((count as { total?: string | number } | null)?.total ?? 0)
    if (total > 0) {
      throw new Error(
        `Cannot resize embedding to vector(1024): ai_knowledge_chunks has ${total} row(s). Truncate or re-embed first.`
      )
    }

    await this.db.rawQuery(`DROP INDEX IF EXISTS "ai_knowledge_chunks_embedding"`)
    await this.db.rawQuery(`
      ALTER TABLE "ai_knowledge_chunks"
        ALTER COLUMN "embedding" TYPE vector(1024)
    `)
    await this.db.rawQuery(`
      CREATE INDEX "ai_knowledge_chunks_embedding"
        ON "ai_knowledge_chunks"
        USING hnsw ("embedding" vector_cosine_ops)
    `)
  }

  async down() {
    const count = await this.db.from('ai_knowledge_chunks').count('* as total').first()
    const total = Number((count as { total?: string | number } | null)?.total ?? 0)
    if (total > 0) {
      throw new Error(
        `Cannot resize embedding back to vector(1536): ai_knowledge_chunks has ${total} row(s).`
      )
    }

    await this.db.rawQuery(`DROP INDEX IF EXISTS "ai_knowledge_chunks_embedding"`)
    await this.db.rawQuery(`
      ALTER TABLE "ai_knowledge_chunks"
        ALTER COLUMN "embedding" TYPE vector(1536)
    `)
    await this.db.rawQuery(`
      CREATE INDEX "ai_knowledge_chunks_embedding"
        ON "ai_knowledge_chunks"
        USING hnsw ("embedding" vector_cosine_ops)
    `)
  }
}
