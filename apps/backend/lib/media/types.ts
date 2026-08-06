/** Lifecycle for org media library rows. */
export enum MediaAssetState {
  PendingUpload = 'pending_upload',
  Ready = 'ready',
  Failed = 'failed',
  Deleted = 'deleted',
}

/** How the object entered the org media library. */
export enum MediaAssetSource {
  Upload = 'upload',
  Inbound = 'inbound',
  System = 'system',
}

/** S3 key folder segment for WhatsApp media kinds. */
export enum MediaStorageFolder {
  Images = 'images',
  Documents = 'documents',
}

export const MEDIA_ASSET_STATES = Object.values(MediaAssetState)
export const MEDIA_ASSET_SOURCES = Object.values(MediaAssetSource)
