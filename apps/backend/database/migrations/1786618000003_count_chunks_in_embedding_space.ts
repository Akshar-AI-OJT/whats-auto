import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Platform AI config PATCH needs a cross-tenant chunk count for the
 * active embedding space. FORCE RLS would hide every row without a tenant GUC.
 */
export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`
      CREATE OR REPLACE FUNCTION count_ai_knowledge_chunks_in_space(p_space_id text)
      RETURNS bigint
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT COUNT(*)::bigint
        FROM ai_knowledge_chunks
        WHERE "embeddingSpaceId" = p_space_id
      $$
    `)
  }

  async down() {
    await this.db.rawQuery(`DROP FUNCTION IF EXISTS count_ai_knowledge_chunks_in_space(text)`)
  }
}
