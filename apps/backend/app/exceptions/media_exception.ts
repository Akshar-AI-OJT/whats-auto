import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Media upload / asset lifecycle errors with stable API codes.
 */
export default class MediaException extends Exception {
  static unsupportedMimeType() {
    return new this(
      'Unsupported media type. Allowed: JPEG/PNG images and PDF/CSV/DOC/DOCX/XLS/XLSX/PPT/PPTX/TXT documents',
      {
        status: 422,
        code: 'E_MEDIA_MIME_UNSUPPORTED',
      }
    )
  }

  static fileTooLarge(maxBytes: number) {
    return new this(`File exceeds the maximum allowed size of ${maxBytes} bytes`, {
      status: 422,
      code: 'E_MEDIA_FILE_TOO_LARGE',
    })
  }

  static notFound() {
    return new this('Media asset not found', {
      status: 404,
      code: 'E_MEDIA_NOT_FOUND',
    })
  }

  static notPending() {
    return new this('Media asset is not awaiting upload completion', {
      status: 422,
      code: 'E_MEDIA_NOT_PENDING',
    })
  }

  static uploadIncomplete() {
    return new this('Uploaded object was not found in storage', {
      status: 422,
      code: 'E_MEDIA_UPLOAD_INCOMPLETE',
    })
  }

  static uploadMismatch(detail: string) {
    return new this(`Uploaded object does not match the declared metadata: ${detail}`, {
      status: 422,
      code: 'E_MEDIA_UPLOAD_MISMATCH',
    })
  }

  static notReady() {
    return new this('Media asset is not ready for sending', {
      status: 422,
      code: 'E_MEDIA_NOT_READY',
    })
  }

  static quotaExceeded(limitBytes: number) {
    return new this(
      `Organization storage quota exceeded (limit ${limitBytes} bytes). Free space or upgrade the plan.`,
      {
        status: 422,
        code: 'E_MEDIA_QUOTA_EXCEEDED',
      }
    )
  }

  static contentRejected(detail: string) {
    return new this(`Uploaded object failed content inspection: ${detail}`, {
      status: 422,
      code: 'E_MEDIA_CONTENT_REJECTED',
    })
  }

  static invalidUploadSignature() {
    return new this('Media upload signature is invalid or expired', {
      status: 403,
      code: 'E_MEDIA_UPLOAD_SIGNATURE_INVALID',
    })
  }

  static notDeletable(detail: string) {
    return new this(detail, {
      status: 422,
      code: 'E_MEDIA_NOT_DELETABLE',
    })
  }

  static notRestorable() {
    return new this('Media asset cannot be restored', {
      status: 422,
      code: 'E_MEDIA_NOT_RESTORABLE',
    })
  }

  static alreadyPurged() {
    return new this('Media asset has already been permanently purged', {
      status: 422,
      code: 'E_MEDIA_ALREADY_PURGED',
    })
  }

  static hasProtectedReferences() {
    return new this(
      'Media asset is referenced by a message, campaign, or template and cannot be deleted',
      {
        status: 422,
        code: 'E_MEDIA_HAS_REFERENCES',
      }
    )
  }

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
    })
  }
}
