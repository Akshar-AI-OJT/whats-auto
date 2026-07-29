import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Wire messages.messageTemplateId → message_templates after templates table exists.
 */
export default class extends BaseSchema {
  protected tableName = 'messages'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .foreign('messageTemplateId', 'messages_message_template_id_foreign')
        .references('id')
        .inTable('message_templates')
        .onDelete('set null')
    })

    this.schema.raw(`
      CREATE INDEX "messages_message_template_id"
        ON "messages" ("messageTemplateId")
        WHERE "messageTemplateId" IS NOT NULL
    `)
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS "messages_message_template_id"`)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign('messageTemplateId', 'messages_message_template_id_foreign')
    })
  }
}
