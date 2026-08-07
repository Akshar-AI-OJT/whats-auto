import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Media upload / asset lifecycle errors with stable API codes.
 */
export default class MediaException extends Exception {
  static unsupportedMimeType() {
    return new this('Only JPEG and PNG images can be uploaded by tenants', {
      status: 422,
      code: 'E_MEDIA_MIME_UNSUPPORTED',
    })
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

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
    })
  }
}
