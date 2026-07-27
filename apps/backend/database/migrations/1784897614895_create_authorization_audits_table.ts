import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'authorization_audits'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('roleId').nullable().references('roles.id').onDelete('set null')
      table.uuid('permissionId').nullable().references('permissions.id').onDelete('set null')
      table.uuid('actorUserId').nullable().references('users.id').onDelete('set null')
      table.text('targetType').notNullable() // 'role' | 'member' | 'invitation' | 'ownership'
      table.uuid('targetId').nullable()
      table.text('eventType').notNullable() // 'role.created' | 'role.updated' | 'member.assigned' | ...
      table.boolean('granted').nullable()
      table.jsonb('before').nullable()
      table.jsonb('after').nullable()
      table.text('reason').nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })
    this.schema.raw(`
      CREATE INDEX "authorization_audits_role_lookup"
        ON "authorization_audits" ("organizationId", "roleId", "createdAt" DESC) WHERE "roleId" IS NOT NULL
    `)
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
