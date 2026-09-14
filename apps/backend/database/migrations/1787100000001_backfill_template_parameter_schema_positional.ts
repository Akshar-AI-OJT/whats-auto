import { BaseSchema } from '@adonisjs/lucid/schema'
import { deriveParameterSchema } from '#lib/meta_whatsapp/template_parameters'

/**
 * Re-derive message_templates.parameterSchema so numbered placeholders
 * ({{1}}, {{2}}) become sendable with parameterFormat: 'positional'.
 * Previously deriveParameterSchema marked them sendable: false.
 */
export default class extends BaseSchema {
  protected tableName = 'message_templates'

  async up() {
    const rows = await this.db
      .from(this.tableName)
      .whereNot('status', 'deleted')
      .select('id', 'headerType', 'headerContent', 'bodyText', 'buttons')

    for (const row of rows) {
      const schema = deriveParameterSchema({
        headerType: (row.headerType as string | null) ?? null,
        headerContent: (row.headerContent as string | null) ?? null,
        bodyText: (row.bodyText as string) ?? '',
        buttons: row.buttons,
      })

      await this.db
        .from(this.tableName)
        .where('id', row.id)
        .update({
          parameterSchema: JSON.stringify(schema),
        })
    }
  }

  async down() {
    // Irreversible data backfill — prior non-sendable numbered schemas cannot be restored.
  }
}
