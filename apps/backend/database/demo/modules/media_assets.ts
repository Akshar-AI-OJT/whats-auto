import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import { daysAgo, upsertById, withTenantWrite } from '#database/demo/helpers'
import type { DemoSeedModule } from '#database/demo/types'
import { buildMediaDeliveryUrl } from '#lib/media/delivery_url'
import { buildMediaStorageKey } from '#lib/media/storage_key'
import { MediaAssetSource, MediaAssetState } from '#lib/media/types'

const DEMO_MEDIA_BASE_URL = 'https://media.demo.local'

export const mediaAssetsModule: DemoSeedModule = {
  id: 'media_assets',
  ownedTables: ['media_assets'],
  dependsOn: ['organizations'],
  async seed(ctx) {
    await withTenantWrite(FIXTURE_IDS.orgs.northstar, async (trx) => {
      const assetId = FIXTURE_IDS.mediaAssets.northstarProductShot
      const uploadedAt = daysAgo(5)
      const storageKey = buildMediaStorageKey({
        organizationId: FIXTURE_IDS.orgs.northstar,
        source: MediaAssetSource.Upload,
        mediaType: 'image',
        assetId,
        mimeType: 'image/jpeg',
        fileName: 'ceramic-vase.jpg',
        at: new Date(uploadedAt),
      })
      const deliveryUrl = buildMediaDeliveryUrl(DEMO_MEDIA_BASE_URL, storageKey)

      await upsertById(
        'media_assets',
        assetId,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          fileName: 'ceramic-vase.jpg',
          filePath: deliveryUrl,
          deliveryUrl,
          storageKey,
          storageDisk: 's3',
          state: MediaAssetState.Ready,
          source: MediaAssetSource.Upload,
          mimeType: 'image/jpeg',
          fileSize: 248320,
          uploadedBy: FIXTURE_IDS.users.northstarAgent,
          uploadedAt,
          createdAt: uploadedAt,
          updatedAt: uploadedAt,
        },
        trx
      )
    })

    await withTenantWrite(FIXTURE_IDS.orgs.harbor, async (trx) => {
      const assetId = FIXTURE_IDS.mediaAssets.harborClassFlyer
      const uploadedAt = daysAgo(3)
      const storageKey = buildMediaStorageKey({
        organizationId: FIXTURE_IDS.orgs.harbor,
        source: MediaAssetSource.Upload,
        mediaType: 'image',
        assetId,
        mimeType: 'image/png',
        fileName: 'spin-class-flyer.png',
        at: new Date(uploadedAt),
      })
      const deliveryUrl = buildMediaDeliveryUrl(DEMO_MEDIA_BASE_URL, storageKey)

      await upsertById(
        'media_assets',
        assetId,
        {
          organizationId: FIXTURE_IDS.orgs.harbor,
          fileName: 'spin-class-flyer.png',
          filePath: deliveryUrl,
          deliveryUrl,
          storageKey,
          storageDisk: 's3',
          state: MediaAssetState.Ready,
          source: MediaAssetSource.Upload,
          mimeType: 'image/png',
          fileSize: 102400,
          uploadedBy: FIXTURE_IDS.users.harborAdmin,
          uploadedAt,
          createdAt: uploadedAt,
          updatedAt: uploadedAt,
        },
        trx
      )
    })

    ctx.mediaAssets = { ...FIXTURE_IDS.mediaAssets }
  },
}
