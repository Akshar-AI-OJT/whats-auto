import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_roles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('userId').notNullable().references('users.id').onDelete('cascade')
      table.uuid('roleId').notNullable().references('roles.id').onDelete('cascade')
      table.uuid('organizationId').nullable().references('organizations.id').onDelete('cascade')
    })

    // One global (superadmin) grant per user
    this.schema.raw(
      `CREATE UNIQUE INDEX user_roles_global_user_unique
         ON user_roles ("userId")
         WHERE "organizationId" IS NULL`
    )

    // One privileged org-scoped grant per user per org (owner)
    this.schema.raw(
      `CREATE UNIQUE INDEX user_roles_user_org_unique
         ON user_roles ("userId", "organizationId")
         WHERE "organizationId" IS NOT NULL`
    )

    // At most one owner per org — name lookup (no fixed role UUID yet).
    // Partial indexes cannot use subqueries, so this is a trigger.
    this.schema.raw(`
      CREATE OR REPLACE FUNCTION ensure_one_owner_per_org()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW."organizationId" IS NULL THEN
          RETURN NEW;
        END IF;

        IF EXISTS (
          SELECT 1 FROM "roles" r
          WHERE r."id" = NEW."roleId" AND r."name" = 'owner'
        ) AND EXISTS (
          SELECT 1
          FROM "user_roles" ur
          JOIN "roles" r2 ON r2."id" = ur."roleId"
          WHERE ur."organizationId" = NEW."organizationId"
            AND r2."name" = 'owner'
            AND ur."id" IS DISTINCT FROM NEW."id"
        ) THEN
          RAISE EXCEPTION
            'Organization already has an owner (organizationId=%)',
            NEW."organizationId";
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)
    this.schema.raw(`
      CREATE TRIGGER trg_ensure_one_owner_per_org
      BEFORE INSERT OR UPDATE ON "user_roles"
      FOR EACH ROW
      EXECUTE FUNCTION ensure_one_owner_per_org();
    `)
  }

  async down() {
    this.schema.raw(`DROP TRIGGER IF EXISTS trg_ensure_one_owner_per_org ON "user_roles"`)
    this.schema.raw(`DROP FUNCTION IF EXISTS ensure_one_owner_per_org()`)
    this.schema.dropTableIfExists(this.tableName)
  }
}
