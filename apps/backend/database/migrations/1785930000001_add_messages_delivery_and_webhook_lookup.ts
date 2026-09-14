import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Delivery timestamps + metadata used by outbound reconcile and inbound webhooks.
 * Also adds a SECURITY DEFINER lookup so Meta webhooks can resolve phone_number_id
 * without a tenant RLS context.
 *
 * Idempotent: safe when columns/function already exist from a partial prior apply.
 */
export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`
      ALTER TABLE "messages"
        ADD COLUMN IF NOT EXISTS "occurredAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS "sentAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "deliveredAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "readAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "failedAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "providerStatusAt" timestamptz
    `)

    await this.db.rawQuery(`
      UPDATE "messages"
      SET "occurredAt" = "createdAt"
      WHERE "occurredAt" IS NULL
    `)

    await this.db.rawQuery(`
      ALTER TABLE "messages"
        ALTER COLUMN "occurredAt" SET DEFAULT now()
    `)

    await this.db.rawQuery(`
      ALTER TABLE "messages"
        ALTER COLUMN "occurredAt" SET NOT NULL
    `)

    await this.db.rawQuery(`
      CREATE OR REPLACE FUNCTION resolve_connected_whatsapp_config(p_phone_number_id text)
      RETURNS TABLE (
        id uuid,
        "organizationId" uuid,
        "phoneNumberId" text,
        status text
      )
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT wc.id, wc."organizationId", wc."phoneNumberId", wc.status
        FROM whatsapp_configs wc
        INNER JOIN organizations o ON o.id = wc."organizationId"
        WHERE wc."phoneNumberId" = p_phone_number_id
          AND wc.status = 'connected'
          AND o."deletedAt" IS NULL
        LIMIT 1
      $$
    `)
  }

  async down() {
    await this.db.rawQuery(`DROP FUNCTION IF EXISTS resolve_connected_whatsapp_config(text)`)

    await this.db.rawQuery(`
      ALTER TABLE "messages"
        DROP COLUMN IF EXISTS "occurredAt",
        DROP COLUMN IF EXISTS "metadata",
        DROP COLUMN IF EXISTS "sentAt",
        DROP COLUMN IF EXISTS "deliveredAt",
        DROP COLUMN IF EXISTS "readAt",
        DROP COLUMN IF EXISTS "failedAt",
        DROP COLUMN IF EXISTS "providerStatusAt"
    `)
  }
}
