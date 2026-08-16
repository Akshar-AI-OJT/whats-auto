import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Trigram index for case-insensitive campaign name search (`whereILike`).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(`CREATE EXTENSION IF NOT EXISTS pg_trgm`)
    this.schema.raw(`
      CREATE INDEX IF NOT EXISTS "broadcasts_name_trgm"
        ON "broadcasts" USING gin ("name" gin_trgm_ops)
    `)
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS "broadcasts_name_trgm"`)
  }
}
