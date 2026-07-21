import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('organizations', (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.text('name').notNullable()
      table.text('slug').notNullable().unique()
      table.text('logo').nullable()
      table.text('metadata').nullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })
    this.schema.createTable('organization_members', (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('userId').notNullable().references('users.id').onDelete('cascade')
      table.text('role').notNullable()
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.unique(['organizationId', 'userId'])
    })
    //One-role constraint: no comma separated multi role
    this.schema.raw(`
      ALTER TABLE "organization_members"
      ADD CONSTRAINT "organization_members_one_role"
      CHECK (btrim("role")<> '' AND "role" !~ ',')
      `)
    this.schema.raw(`
          CREATE INDEX "organization_members_user_org"
            ON "organization_members" ("userId", "organizationId")
        `)
    this.schema.createTable('organization_invitations', (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.text('email').notNullable()
      table.text('role').notNullable()
      table.text('status').notNullable().defaultTo('pending')
      table.timestamp('expiresAt', { useTz: true }).notNullable()
      table.uuid('inviterId').notNullable().references('users.id').onDelete('cascade')
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })
    this.schema.raw(`
      ALTER TABLE "organization_invitations"
        ADD CONSTRAINT "organization_invitations_one_role"
        CHECK (btrim("role") <> '' AND "role" !~ ','),
        ADD CONSTRAINT "organization_invitations_status"
        CHECK ("status" IN ('pending', 'accepted', 'rejected', 'canceled'))
    `)
    this.schema.raw(`
      CREATE INDEX "organization_invitations_org_pending"
        ON "organization_invitations" ("organizationId", "email")
        WHERE "status" = 'pending'
    `)
    this.schema.createTable('organization_roles', (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.text('role').notNullable() // immutable key — used in member.role
      table.text('displayName').notNullable() // editable UI label
      table.text('permission').notNullable() // Better Auth resource/action JSON as text
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
      table.unique(['organizationId', 'role'])
    })
    this.schema.raw(`
      ALTER TABLE "organization_roles"
        ADD CONSTRAINT "organization_roles_permission_json"
        CHECK (jsonb_typeof("permission"::jsonb) = 'object')
    `)
    this.schema.raw(`
      CREATE UNIQUE INDEX "organization_roles_display_name_unique"
        ON "organization_roles" ("organizationId", lower("displayName"))
    `)
  }

  async down() {
    this.schema.dropTableIfExists('organization_roles')
    this.schema.dropTableIfExists('organization_invitations')
    this.schema.dropTableIfExists('organization_members')
    this.schema.dropTableIfExists('organizations')
  }
}
