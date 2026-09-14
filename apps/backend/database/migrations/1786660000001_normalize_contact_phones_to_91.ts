import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Canonicalize live contact phones to 91XXXXXXXXXX.
 * Duplicate 10-digit / 91-prefixed pairs keep the 91 form (else oldest) and soft-delete the rest.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      CREATE OR REPLACE FUNCTION canonicalize_indian_mobile(raw text)
      RETURNS text AS $$
      DECLARE
        digits text;
      BEGIN
        digits := regexp_replace(coalesce(raw, ''), '\\D', '', 'g');
        IF digits LIKE '00%' THEN
          digits := substr(digits, 3);
        END IF;
        IF length(digits) = 13 AND digits LIKE '910%' AND substr(digits, 4) ~ '^[6-9][0-9]{9}$' THEN
          RETURN '91' || substr(digits, 4);
        END IF;
        IF length(digits) = 11 AND digits LIKE '0%' AND substr(digits, 2) ~ '^[6-9][0-9]{9}$' THEN
          RETURN '91' || substr(digits, 2);
        END IF;
        IF length(digits) = 12 AND digits LIKE '91%' AND substr(digits, 3) ~ '^[6-9][0-9]{9}$' THEN
          RETURN digits;
        END IF;
        IF length(digits) = 10 AND digits ~ '^[6-9][0-9]{9}$' THEN
          RETURN '91' || digits;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `)

    this.schema.raw(`
      DO $$
      DECLARE
        g record;
        keeper uuid;
      BEGIN
        FOR g IN
          SELECT
            c."organizationId",
            canonicalize_indian_mobile(c."phoneNormalized") AS canonical
          FROM contacts c
          WHERE c."deletedAt" IS NULL
            AND canonicalize_indian_mobile(c."phoneNormalized") IS NOT NULL
          GROUP BY c."organizationId", canonicalize_indian_mobile(c."phoneNormalized")
        LOOP
          SELECT c.id INTO keeper
          FROM contacts c
          WHERE c."organizationId" = g."organizationId"
            AND c."deletedAt" IS NULL
            AND canonicalize_indian_mobile(c."phoneNormalized") = g.canonical
          ORDER BY
            CASE WHEN c."phoneNormalized" = g.canonical THEN 0 ELSE 1 END,
            c."createdAt" ASC
          LIMIT 1;

          UPDATE contacts
          SET "phoneNormalized" = g.canonical, phone = g.canonical
          WHERE id = keeper;

          UPDATE contacts
          SET "deletedAt" = now()
          WHERE "organizationId" = g."organizationId"
            AND "deletedAt" IS NULL
            AND id <> keeper
            AND canonicalize_indian_mobile("phoneNormalized") = g.canonical;
        END LOOP;
      END $$;
    `)

    this.schema.raw(`DROP FUNCTION IF EXISTS canonicalize_indian_mobile(text)`)
  }

  async down() {
    // Canonicalization is not reversible without the original input.
  }
}
