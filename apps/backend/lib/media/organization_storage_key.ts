import type { OutboundMediaType } from '#lib/meta_whatsapp/outbound_media'
import { extensionForMedia, mediaFolderForType } from '#lib/media/storage_key'
import {
  STORAGE_NAMESPACE_PATH,
  StorageNamespace,
  type StorageRetentionPolicy,
  StorageRetentionPolicy as Retention,
} from '#lib/media/storage_types'

export type BuildOrganizationStorageKeyParams = {
  organizationId: string
  namespace: StorageNamespace
  mediaType: OutboundMediaType
  assetId: string
  mimeType: string
  fileName?: string
  /** Required for campaigns namespace. */
  campaignId?: string
}

/**
 * Namespace-aware v2 key. Domain intent picks namespace; never trust client paths.
 *
 * media_library: organizations/{orgId}/media-library/{images|documents}/{assetId}.{ext}
 * campaigns:     organizations/{orgId}/campaigns/{campaignId}/{images|documents}/{assetId}.{ext}
 * temp uploads:  organizations/{orgId}/temp/uploads/{assetId}
 */
export function buildOrganizationStorageKey(params: BuildOrganizationStorageKeyParams): string {
  const nsPath = STORAGE_NAMESPACE_PATH[params.namespace]
  const ext = extensionForMedia({ mimeType: params.mimeType, fileName: params.fileName })
  const folder = mediaFolderForType(params.mediaType)

  if (params.namespace === StorageNamespace.MediaLibrary) {
    return ['organizations', params.organizationId, nsPath, folder, `${params.assetId}${ext}`].join(
      '/'
    )
  }

  if (params.namespace === StorageNamespace.Campaigns) {
    if (!params.campaignId) {
      throw new Error('campaignId is required for campaigns storage namespace')
    }
    return [
      'organizations',
      params.organizationId,
      nsPath,
      params.campaignId,
      folder,
      `${params.assetId}${ext}`,
    ].join('/')
  }

  if (params.namespace === StorageNamespace.Temp) {
    return ['organizations', params.organizationId, nsPath, 'uploads', params.assetId].join('/')
  }

  throw new Error(`Storage key factory does not yet support namespace: ${params.namespace}`)
}

export function retentionForNamespace(namespace: StorageNamespace): StorageRetentionPolicy {
  switch (namespace) {
    case StorageNamespace.MediaLibrary:
    case StorageNamespace.Profile:
    case StorageNamespace.KnowledgeBase:
      return Retention.UntilDeleted
    case StorageNamespace.Campaigns:
      return Retention.CampaignTerminalPlus30d
    case StorageNamespace.Ai:
      return Retention.Ai30d
    case StorageNamespace.Imports:
      return Retention.Import7d
    case StorageNamespace.Exports:
      return Retention.Export7d
    case StorageNamespace.Temp:
      return Retention.Temp24h
    default:
      return Retention.UntilDeleted
  }
}

export function isLegacyStorageKey(storageKey: string): boolean {
  return !storageKey.startsWith('organizations/')
}
