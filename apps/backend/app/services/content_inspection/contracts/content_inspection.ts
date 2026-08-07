/**
 * Replaceable content inspection boundary (magic-byte / signature checks now;
 * malware scanning can plug in later without API changes).
 */
export type ContentInspectionInput = {
  mimeType: string
  /** First bytes of the object when available (e.g. S3 Range GET). */
  prefix: Uint8Array | null
  sizeBytes: number
}

export type ContentInspectionResult = { ok: true } | { ok: false; reason: string }

export abstract class ContentInspection {
  abstract inspect(input: ContentInspectionInput): Promise<ContentInspectionResult>
}
