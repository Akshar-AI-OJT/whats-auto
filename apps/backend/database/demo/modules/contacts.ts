import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import { daysAgo, jsonb, upsertById, withTenantWrite } from '#database/demo/helpers'
import type { DemoSeedModule } from '#database/demo/types'

export const contactsModule: DemoSeedModule = {
  id: 'contacts',
  ownedTables: ['contacts'],
  dependsOn: ['organizations'],
  async seed(ctx) {
    ctx.contacts = {}

    await withTenantWrite(FIXTURE_IDS.orgs.northstar, async (trx) => {
      await upsertById(
        'contacts',
        FIXTURE_IDS.contacts.northstarPriya,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          phone: '919811122233',
          phoneNormalized: '919811122233',
          name: 'Priya Kapoor',
          email: 'priya.kapoor@example.com',
          company: 'Kapoor Interiors',
          customFields: jsonb({ segment: 'wholesale', city: 'Mumbai' }),
          createdByUserId: FIXTURE_IDS.users.northstarOwner,
          deletedAt: null,
        },
        trx
      )

      await upsertById(
        'contacts',
        FIXTURE_IDS.contacts.northstarDeleted,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          phone: '919844455566',
          phoneNormalized: '919844455566',
          name: 'Archived Contact',
          email: null,
          company: null,
          customFields: jsonb({}),
          createdByUserId: FIXTURE_IDS.users.northstarAdmin,
          deletedAt: daysAgo(14),
        },
        trx
      )
    })

    await withTenantWrite(FIXTURE_IDS.orgs.harbor, async (trx) => {
      await upsertById(
        'contacts',
        FIXTURE_IDS.contacts.harborJordan,
        {
          organizationId: FIXTURE_IDS.orgs.harbor,
          phone: '+12125550987',
          phoneNormalized: '+12125550987',
          name: 'Jordan Ellis',
          email: 'jordan.ellis@example.com',
          company: null,
          customFields: jsonb({ membership: 'premium' }),
          createdByUserId: FIXTURE_IDS.users.harborOwner,
          deletedAt: null,
        },
        trx
      )
    })

    ctx.contacts = { ...FIXTURE_IDS.contacts }
  },
}
