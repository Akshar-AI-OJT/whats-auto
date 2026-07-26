import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('organizations', (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.text('name').notNullable()
      table.string('slug', 100).notNullable()
      table.string('email', 255).notNullable()
      table.string('phone', 100).nullable()
      table.string('website', 255).nullable()
      table.string('industry', 100).nullable()
      table.string('country', 100).notNullable()
      table.string('timezone', 100).notNullable()
      table.string('currency', 10)
      table.boolean('status').notNullable().defaultTo(true)
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('updatedAt', { useTz: true }).nullable()
      table.timestamp('deletedAt', { useTz: true }).nullable()
    })
    this.schema.raw(
      'CREATE UNIQUE INDEX organizations_slug_unique ON organizations (slug) WHERE "deletedAt" IS NULL'
    )
    this.schema.raw(
      'CREATE UNIQUE INDEX organizations_email_unique ON organizations (email) WHERE "deletedAt" IS NULL'
    )

    this.schema.createTable('organization_members', (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('userId').notNullable().references('users.id').onDelete('cascade')
      table.uuid('roleId').notNullable().references('roles.id').onDelete('cascade')
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.unique(['organizationId', 'userId'])
    })
    this.schema.raw(
      'CREATE INDEX organization_members_org_role ON organization_members ("organizationId", "roleId")'
    )

    this.schema.createTable('organization_invitations', (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('roleId').notNullable().references('roles.id').onDelete('cascade')
      table.uuid('inviterId').notNullable().references('users.id').onDelete('cascade')
      table.string('email', 255).notNullable()
      table.text('status').notNullable().defaultTo('pending')
      table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
      table.timestamp('expiresAt', { useTz: true }).notNullable()
    })
    this.schema.raw(`
      ALTER TABLE "organization_invitations"
        ADD CONSTRAINT "organization_invitations_status"
        CHECK ("status" IN ('pending', 'accepted', 'rejected', 'canceled'))
    `)
    this.schema.raw(
      `CREATE UNIQUE INDEX organization_invitations_org_pending_unique ON organization_invitations ("organizationId", "email") WHERE "status" = 'pending'`
    )
    this.schema.createTable('organization_role_permissions', (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('organizationId').notNullable().references('organizations.id').onDelete('cascade')
      table.uuid('roleId').notNullable().references('roles.id').onDelete('cascade')
      table.uuid('permissionId').notNullable().references('permissions.id').onDelete('cascade')
      table.boolean('granted').notNullable().defaultTo(true)
      table.unique(['organizationId', 'roleId', 'permissionId'])
    })
    // Owner/superadmin permissions are immutable — overrides only allowed for agent/viewer.
    // Uses a name lookup (not hardcoded UUIDs) because roles.id is gen_random_uuid() until seeded.
    this.schema.raw(`
      CREATE OR REPLACE FUNCTION reject_immutable_role_permission_overrides()
      RETURNS TRIGGER AS $$
      DECLARE
        role_name text;
      BEGIN
        SELECT r."name" INTO role_name
        FROM "roles" r
        WHERE r."id" = NEW."roleId";

        IF role_name IN ('owner', 'superadmin') THEN
          RAISE EXCEPTION
            'Cannot override permissions for immutable role "%" (roleId=%)',
            role_name, NEW."roleId";
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)
    this.schema.raw(`
      CREATE TRIGGER trg_reject_immutable_role_permission_overrides
      BEFORE INSERT OR UPDATE ON "organization_role_permissions"
      FOR EACH ROW
      EXECUTE FUNCTION reject_immutable_role_permission_overrides();
    `)
    this.schema.alterTable('roles', (table) => {
      table.uuid('organizationId').nullable().references('organizations.id').onDelete('cascade')
    })
    //global roles (owner, admin, agent, viewer, superadmin) — organizationId IS NULL
    this.schema.raw(
      'CREATE UNIQUE INDEX roles_global_name_unique ON roles (name) WHERE "organizationId" IS NULL'
    )
    //custom roles — unique per org, same name reusable across different orgs
    this.schema.raw(
      'CREATE UNIQUE INDEX roles_org_name_unique ON roles (name, "organizationId") WHERE "organizationId" IS NOT NULL'
    )
    this.schema.raw(`
      CREATE OR REPLACE FUNCTION reject_custom_role_org_overrides()
      RETURNS TRIGGER AS $$
      DECLARE
        role_org_id uuid;
      BEGIN
        SELECT r."organizationId" INTO role_org_id FROM "roles" r WHERE r."id" = NEW."roleId";
        IF role_org_id IS NOT NULL THEN
          RAISE EXCEPTION
            'organization_role_permissions only applies to global roles, not org-scoped custom roles (roleId=%)',
            NEW."roleId";
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)
    this.schema.raw(`
      CREATE TRIGGER trg_reject_custom_role_org_overrides
      BEFORE INSERT OR UPDATE ON "organization_role_permissions"
      FOR EACH ROW
      EXECUTE FUNCTION reject_custom_role_org_overrides();
    `)
  }

  async down() {
    this.schema.raw(
      `DROP TRIGGER IF EXISTS trg_reject_custom_role_org_overrides ON "organization_role_permissions"`
    )
    this.schema.raw(`DROP FUNCTION IF EXISTS reject_custom_role_org_overrides()`)

    this.schema.alterTable('roles', (table) => {
      table.dropColumn('organizationId')
    })
    this.schema.raw(
      `DROP TRIGGER IF EXISTS trg_reject_immutable_role_permission_overrides ON "organization_role_permissions"`
    )
    this.schema.raw(`DROP FUNCTION IF EXISTS reject_immutable_role_permission_overrides()`)
    this.schema.dropTableIfExists('organization_role_permissions')
    this.schema.dropTableIfExists('organization_invitations')
    this.schema.dropTableIfExists('organization_members')
    this.schema.dropTableIfExists('organizations')
  }
}
