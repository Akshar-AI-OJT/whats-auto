import db from '@adonisjs/lucid/services/db'

/**
 * Test DB connects as superuser (`postgres`), which bypasses FORCE RLS.
 * Isolation assertions must SET LOCAL ROLE to a NOSUPERUSER / NOBYPASSRLS role.
 */
export const RLS_READER_ROLE = 'whats_auto_rls_reader'

export async function ensureRlsReaderRole() {
  await db.rawQuery(`
    DO $role$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RLS_READER_ROLE}') THEN
        CREATE ROLE ${RLS_READER_ROLE} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT NOLOGIN;
      END IF;
    END
    $role$;
  `)
  await db.rawQuery(`GRANT USAGE ON SCHEMA public TO ${RLS_READER_ROLE}`)
  await db.rawQuery(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${RLS_READER_ROLE}`)
}

export async function selectRowsWithRls(
  organizationId: string | null,
  table: string,
  where?: Record<string, unknown>
) {
  return db.transaction(async (trx) => {
    await trx.rawQuery(`SET LOCAL ROLE ${RLS_READER_ROLE}`)
    await trx.rawQuery(`SELECT set_config('app.current_organization_id', ?, true)`, [
      organizationId ?? '',
    ])
    const query = trx.from(table)
    if (where) {
      query.where(where)
    }
    return query.select('*')
  })
}
