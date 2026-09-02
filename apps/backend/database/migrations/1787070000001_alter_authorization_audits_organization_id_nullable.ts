import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'authorization_audits'

  async up() {
    this.schema.raw(`
      ALTER TABLE "${this.tableName}"
        ALTER COLUMN "organizationId" DROP NOT NULL
    `)
  }

  async down() {
    this.schema.raw(`
      ALTER TABLE "${this.tableName}"
        ALTER COLUMN "organizationId" SET NOT NULL
    `)
  }
}
