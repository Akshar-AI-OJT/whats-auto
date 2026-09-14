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
 * Swappable object-store boundary for **all** organization uploads
 * (media, knowledge, contact-import CSVs, etc.).
 * Prefer IoC `ObjectStorage` — do not write org files via Drive directly.
 */
export abstract class ObjectStorage {
  abstract createPresignedUpload(params: {
    key: string
    contentType: string
    contentLength: number
    expiresInSeconds?: number
    /** Required by LocalObjectStorage for HMAC upload URLs; ignored by S3/Fake. */
    assetId?: string
    organizationId?: string
  }): Promise<PresignedUpload>

  abstract headObject(key: string): Promise<ObjectHeadResult | null>

  abstract deleteObject(key: string): Promise<void>

  /** Server-side write (manual KB text, contact-import CSV, etc.). Browser uploads still use presign. */
  abstract writeObject(params: {
    key: string
    body: Uint8Array
    contentType: string
  }): Promise<void>

  /**
   * Read the first maxBytes of an object for content inspection.
   * Returns null when the object is missing.
   */
  abstract getObjectPrefix(params: { key: string; maxBytes: number }): Promise<Uint8Array | null>

  /**
   * Read the full object body. Returns null when the object is missing.
   */
  abstract getObject(key: string): Promise<Uint8Array | null>

  async objectExists(key: string): Promise<boolean> {
    return (await this.headObject(key)) !== null
  }
}
