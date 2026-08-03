import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import { daysAgo, upsertById, withTenantWrite } from '#database/demo/helpers'
import type { DemoSeedModule } from '#database/demo/types'

export const mediaAssetsModule: DemoSeedModule = {
  id: 'media_assets',
  ownedTables: ['media_assets'],
  dependsOn: ['organizations'],
  async seed(ctx) {
    await withTenantWrite(FIXTURE_IDS.orgs.northstar, async (trx) => {
      await upsertById(
        'media_assets',
        FIXTURE_IDS.mediaAssets.northstarProductShot,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          fileName: 'ceramic-vase.jpg',
          filePath: 'demo://northstar/media/ceramic-vase.jpg',
          mimeType: 'image/jpeg',
          fileSize: 248320,
          uploadedBy: FIXTURE_IDS.users.northstarAgent,
          uploadedAt: daysAgo(5),
        },
        trx
      )
    })

    await withTenantWrite(FIXTURE_IDS.orgs.harbor, async (trx) => {
      await upsertById(
        'media_assets',
        FIXTURE_IDS.mediaAssets.harborClassFlyer,
        {
          organizationId: FIXTURE_IDS.orgs.harbor,
          fileName: 'spin-class-flyer.png',
          filePath: 'demo://harbor/media/spin-class-flyer.png',
          mimeType: 'image/png',
          fileSize: 102400,
          uploadedBy: FIXTURE_IDS.users.harborAdmin,
          uploadedAt: daysAgo(3),
        },
        trx
      )
    })

    ctx.mediaAssets = { ...FIXTURE_IDS.mediaAssets }
  },
}
