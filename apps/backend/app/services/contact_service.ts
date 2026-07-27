import db from '@adonisjs/lucid/services/db'

export class ContactService {
  /**
   * List contacts for the active tenant. Relies on Postgres RLS
   * (app.current_organization_id) — do not filter organizationId in app code.
   */
  async listContacts() {
    const rows = await db
      .from('contacts')
      .select('id', 'organizationId', 'phone', 'createdAt')
      .orderBy('createdAt', 'desc')

    return rows.map((r) => ({
      id: r.id as string,
      organizationId: r.organizationId as string,
      phone: r.phone as string,
      createdAt: r.createdAt as string,
    }))
  }

  /**
   * Insert a contact for the active tenant. RLS WITH CHECK enforces organizationId
   * matches the stamped GUC from TenantRlsProvider.
   */
  async createContact(organizationId: string, phone: string) {
    const [row] = await db
      .table('contacts')
      .insert({ organizationId, phone })
      .returning(['id', 'organizationId', 'phone', 'createdAt'])

    return {
      id: row.id as string,
      organizationId: row.organizationId as string,
      phone: row.phone as string,
      createdAt: row.createdAt as string,
    }
  }
}
