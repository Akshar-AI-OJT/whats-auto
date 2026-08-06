export type PresignedUpload = {
  method: 'PUT'
  url: string
  headers: Record<string, string>
  expiresInSeconds: number
}

export type ObjectHeadResult = {
  contentLength: number
  contentType: string | null
  eTag: string | null
}

/**
 * Swappable object-store boundary for media (presign / verify / delete).
 * Drive remains available for other disk ops; direct-upload uses this contract.
 */
export abstract class ObjectStorage {
  abstract createPresignedUpload(params: {
    key: string
    contentType: string
    contentLength: number
    expiresInSeconds?: number
  }): Promise<PresignedUpload>

  abstract headObject(key: string): Promise<ObjectHeadResult | null>

  abstract deleteObject(key: string): Promise<void>
}
