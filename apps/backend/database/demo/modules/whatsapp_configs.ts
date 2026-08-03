import { encryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import { daysAgo, upsertById, withTenantWrite } from '#database/demo/helpers'
import type { DemoSeedModule } from '#database/demo/types'

export const whatsappConfigsModule: DemoSeedModule = {
  id: 'whatsapp_configs',
  ownedTables: ['whatsapp_configs'],
  dependsOn: ['organizations'],
  async seed(ctx) {
    const encrypted = encryptWhatsappAccessToken('demo-meta-access-token-not-live')

    await withTenantWrite(FIXTURE_IDS.orgs.northstar, async (trx) => {
      await upsertById(
        'whatsapp_configs',
        FIXTURE_IDS.whatsappConfigs.northstarConnected,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          phoneNumberId: 'demo-phone-northstar-connected',
          wabaId: 'demo-waba-northstar',
          accessToken: encrypted,
          verifyToken: 'demo-verify-northstar',
          status: 'connected',
          connectedAt: daysAgo(30),
          registeredAt: daysAgo(30),
          subscribedAppsAt: daysAgo(30),
          createdByUserId: FIXTURE_IDS.users.northstarOwner,
        },
        trx
      )

      await upsertById(
        'whatsapp_configs',
        FIXTURE_IDS.whatsappConfigs.northstarDisconnected,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          phoneNumberId: 'demo-phone-northstar-disconnected',
          wabaId: 'demo-waba-northstar-2',
          accessToken: encrypted,
          verifyToken: null,
          status: 'disconnected',
          connectedAt: null,
          registeredAt: null,
          subscribedAppsAt: null,
          createdByUserId: FIXTURE_IDS.users.northstarAdmin,
        },
        trx
      )
    })

    await withTenantWrite(FIXTURE_IDS.orgs.harbor, async (trx) => {
      await upsertById(
        'whatsapp_configs',
        FIXTURE_IDS.whatsappConfigs.harborError,
        {
          organizationId: FIXTURE_IDS.orgs.harbor,
          phoneNumberId: 'demo-phone-harbor-error',
          wabaId: 'demo-waba-harbor',
          accessToken: encrypted,
          verifyToken: 'demo-verify-harbor',
          status: 'error',
          connectedAt: daysAgo(10),
          registeredAt: daysAgo(10),
          subscribedAppsAt: null,
          createdByUserId: FIXTURE_IDS.users.harborOwner,
        },
        trx
      )
    })

    ctx.whatsappConfigs = { ...FIXTURE_IDS.whatsappConfigs }
  },
}
