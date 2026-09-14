import {
  ContentInspection,
  type ContentInspectionInput,
  type ContentInspectionResult,
} from '#services/content_inspection/contracts/content_inspection'
import { normalizeMimeType } from '#lib/meta_whatsapp/outbound_media'

/**
 * Lightweight magic-byte check for supported Media Library MIME types.
 * Passes when prefix is unavailable so upload complete still works if Range GET fails.
 */
export default class SignatureContentInspection extends ContentInspection {
  async inspect(input: ContentInspectionInput): Promise<ContentInspectionResult> {
    const mime = normalizeMimeType(input.mimeType)
    if (input.sizeBytes <= 0) {
      return { ok: false, reason: 'empty object' }
    }

    if (!input.prefix || input.prefix.byteLength === 0) {
      return { ok: true }
    }

    const bytes = input.prefix
    if (mime === 'image/jpeg') {
      if (bytes[0] === 0xff && bytes[1] === 0xd8) {
        return { ok: true }
      }
      return { ok: false, reason: 'not a JPEG signature' }
    }

    if (mime === 'image/png') {
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        return { ok: true }
      }
      return { ok: false, reason: 'not a PNG signature' }
    }

    if (mime === 'application/pdf') {
      if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
        return { ok: true }
      }
      return { ok: false, reason: 'not a PDF signature' }
    }

    // OOXML (docx/xlsx/pptx) and legacy OLE containers often start as ZIP (PK).
    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) {
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        return { ok: true }
      }
      return { ok: false, reason: 'not an Office Open XML (ZIP) signature' }
    }

    if (mime === 'text/csv' || mime === 'application/csv' || mime === 'text/plain') {
      if (looksBinary(bytes)) {
        return { ok: false, reason: 'CSV/text content looks binary' }
      }
      return { ok: true }
    }

    return { ok: true }
  }
}

function looksBinary(bytes: Uint8Array): boolean {
  // Reject clear binary magic that should never appear as CSV/text.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return true
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return true
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44) return true
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return true
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) return true // OLE Compound File

  let suspicious = 0
  const n = Math.min(bytes.byteLength, 16)
  for (let i = 0; i < n; i++) {
    const b = bytes[i]!
    if (b === 0) {
      suspicious += 1
      continue
    }
    // Allow UTF-8 BOM and common text bytes.
    if (b < 0x09 || (b > 0x0d && b < 0x20 && b !== 0x1b)) {
      suspicious += 1
    }
  }
  return suspicious >= 4
}
