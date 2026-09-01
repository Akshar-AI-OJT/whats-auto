import db from '@adonisjs/lucid/services/db'

export type ContactConsentSource = 'csv' | 'manual' | 'keyword'

/**
 * Append-only contact_consent_events plus contacts.marketingOptIn / optedOutAt.
 * Callers must run inside runWithTenant.
 */
export class ContactConsentRepository {
  async recordOptOut(params: {
    organizationId: string
    contactId: string
    source: ContactConsentSource
  }): Promise<void> {
    const now = new Date()
    await db.transaction(async (trx) => {
      await trx.table('contact_consent_events').insert({
        organizationId: params.organizationId,
        contactId: params.contactId,
        eventType: 'opt_out',
        source: params.source,
      })

      await trx
        .from('contacts')
        .where('id', params.contactId)
        .where('organizationId', params.organizationId)
        .update({
          marketingOptIn: false,
          optedOutAt: now,
          updatedAt: now,
        })
    })
  }
}
