import type { HttpContext } from '@adonisjs/core/http'
import MediaException from '#exceptions/media_exception'
import MediaAssetPolicy from '#policies/media_asset_policy'
import { MediaAssetService } from '#services/media_asset_service'
import { StorageNamespace } from '#lib/media/storage_types'
import { initiateMediaUploadValidator, mediaUploadIdParamValidator } from '#validators/media'
import vine from '@vinejs/vine'
import '#types/http'

const putContentQueryValidator = vine.create(
  vine.object({
    expires: vine.number(),
    key: vine.string().minLength(1),
    org: vine.string().uuid(),
    sig: vine.string().minLength(16),
  })
)

export default class MediaUploadsController {
  /**
   * @store
   * @summary Initiate a direct media upload
   * @description Creates a pending media asset and returns a short-lived PUT contract (S3-compatible presign or local HMAC URL). Call complete after the browser uploads bytes. Pass purpose=organization_logo for org profile logo keys.
   * @tag Media
   * @security BearerAuth
   * @requestBody { "fileName": "banner.jpg", "mimeType": "image/jpeg", "fileSize": 102400 }
   * @responseBody 200 - { "data": { "asset": { "id": "uuid", "state": "pending_upload", "deliveryUrl": "https://cdn.example.com/..." }, "upload": { "method": "PUT", "url": "https://...", "headers": {}, "expiresInSeconds": 900 } } }
   * @responseBody 422 - { "error": "MIME type is not supported for WhatsApp media", "code": "E_MEDIA_MIME_UNSUPPORTED" }
   * @responseBody 403 - { "error": "Permission denied: media:upload", "code": "PERMISSION_DENIED" }
   */
  async store({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(MediaAssetPolicy).authorize('upload')

    const payload = await request.validateUsing(initiateMediaUploadValidator)

    const result = await new MediaAssetService().initiateUpload({
      organizationId: request.activeMember!.organizationId,
      uploadedBy: request.authUser!.id,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      fileSize: payload.fileSize,
      namespace: payload.purpose === 'organization_logo' ? StorageNamespace.Profile : undefined,
    })

    return serialize(result)
  }

  /**
   * @putContent
   * @summary Upload media bytes (local-disk driver)
   * @description HMAC-signed PUT used when OBJECT_STORAGE_DRIVER=fs. No Bearer auth — signature is the credential.
   * @tag Media
   * @paramPath id - Media asset id - @type(string)
   * @responseBody 204 - empty
   * @responseBody 403 - { "error": "Media upload signature is invalid or expired", "code": "E_MEDIA_UPLOAD_SIGNATURE_INVALID" }
   */
  async putContent({ request, params, response }: HttpContext) {
    const { id } = await request.validateUsing(mediaUploadIdParamValidator, {
      data: params,
    })
    const query = await putContentQueryValidator.validate(request.qs())

    const raw = request.raw()
    if (raw === null || raw === undefined) {
      throw MediaException.uploadIncomplete()
    }
    const body =
      typeof raw === 'string'
        ? Buffer.from(raw, 'binary')
        : Buffer.isBuffer(raw)
          ? raw
          : Buffer.from(raw)

    await new MediaAssetService().putUploadContent({
      mediaAssetId: id,
      organizationId: query.org,
      storageKey: query.key,
      expiresAtUnix: query.expires,
      signature: query.sig,
      body: new Uint8Array(body),
      contentType: request.header('content-type') ?? null,
    })

    return response.status(204).send(null)
  }

  /**
   * @complete
   * @summary Complete a media upload
   * @description Verifies the stored object via HeadObject/stat and marks the asset ready for WhatsApp sends.
   * @tag Media
   * @security BearerAuth
   * @paramPath id - Media asset id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "state": "ready", "deliveryUrl": "https://cdn.example.com/..." } }
   * @responseBody 404 - { "error": "Media asset not found", "code": "E_MEDIA_NOT_FOUND" }
   * @responseBody 422 - { "error": "Uploaded object was not found in storage", "code": "E_MEDIA_UPLOAD_INCOMPLETE" }
   */
  async complete({ bouncer, request, params, serialize }: HttpContext) {
    await bouncer.with(MediaAssetPolicy).authorize('upload')

    const { id } = await request.validateUsing(mediaUploadIdParamValidator, {
      data: params,
    })

    const asset = await new MediaAssetService().completeUpload({
      organizationId: request.activeMember!.organizationId,
      mediaAssetId: id,
    })

    return serialize(asset)
  }
}
