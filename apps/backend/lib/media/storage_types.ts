/** Lifecycle for generic organization S3 objects. */
export enum StorageObjectState {
  PendingUpload = 'pending_upload',
  Ready = 'ready',
  Failed = 'failed',
  Deleted = 'deleted',
  Purged = 'purged',
}

/** Canonical S3 namespace (key path segment group). */
export enum StorageNamespace {
  MediaLibrary = 'media_library',
  Campaigns = 'campaigns',
  KnowledgeBase = 'knowledge_base',
  Ai = 'ai',
  Profile = 'profile',
  Imports = 'imports',
  Exports = 'exports',
  Temp = 'temp',
}

/** Retention rule attached at object creation. */
export enum StorageRetentionPolicy {
  UntilDeleted = 'until_deleted',
  CampaignTerminalPlus30d = 'campaign_terminal_plus_30d',
  Ai30d = 'ai_30d',
  Import7d = 'import_7d',
  Export7d = 'export_7d',
  Temp24h = 'temp_24h',
}

/** Domain owner that caused the object to exist. */
export enum StorageOwnerType {
  MediaAsset = 'media_asset',
  Campaign = 'campaign',
  OrganizationProfile = 'organization_profile',
  KnowledgeSource = 'knowledge_source',
  Import = 'import',
  Export = 'export',
  TempUpload = 'temp_upload',
  AiGeneration = 'ai_generation',
}

/** Provenance / how the bytes entered storage. */
export enum StorageProvenance {
  Upload = 'upload',
  Inbound = 'inbound',
  System = 'system',
  Integration = 'integration',
  Ai = 'ai',
}

/** URL path segment for each namespace (immutable keys). */
export const STORAGE_NAMESPACE_PATH: Record<StorageNamespace, string> = {
  [StorageNamespace.MediaLibrary]: 'media-library',
  [StorageNamespace.Campaigns]: 'campaigns',
  [StorageNamespace.KnowledgeBase]: 'knowledge-base',
  [StorageNamespace.Ai]: 'ai',
  [StorageNamespace.Profile]: 'profile',
  [StorageNamespace.Imports]: 'imports',
  [StorageNamespace.Exports]: 'exports',
  [StorageNamespace.Temp]: 'temp',
}

export const STORAGE_OBJECT_STATES = Object.values(StorageObjectState)
export const STORAGE_NAMESPACES = Object.values(StorageNamespace)
export const STORAGE_RETENTION_POLICIES = Object.values(StorageRetentionPolicy)

/** Soft-delete restore grace before S3 hard delete. */
export const STORAGE_SOFT_DELETE_GRACE_MS = 30 * 24 * 60 * 60 * 1000

/** Pending direct-upload orphan window (presign stays 15 minutes). */
export const STORAGE_PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000

/** Plan limit key for org storage quota (bytes). */
export const STORAGE_BYTES_LIMIT_KEY = 'storageBytes'

export const PLAN_STORAGE_BYTES = {
  starter: 1_073_741_824,
  growth: 10_737_418_240,
  scale: 107_374_182_400,
} as const

/** Fallback when org has no entitled plan.limits.storageBytes. */
export const DEFAULT_STORAGE_BYTES_LIMIT = PLAN_STORAGE_BYTES.starter
