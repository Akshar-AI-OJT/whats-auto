import type { HttpContext } from '@adonisjs/core/http'
import { MediaAssetService } from '#services/media_asset_service'
import { initiateMediaUploadValidator, mediaUploadIdParamValidator } from '#validators/media'
import '#types/http'

export default class MediaUploadsController {
  /**
   * @store
   * @summary Initiate a direct-to-S3 media upload
   * @description Creates a pending media asset and returns a short-lived presigned PUT contract. Call complete after the browser uploads bytes.
   * @tag Media
   * @security BearerAuth
   * @requestBody { "fileName": "banner.jpg", "mimeType": "image/jpeg", "fileSize": 102400 }
   * @responseBody 200 - { "data": { "asset": { "id": "uuid", "state": "pending_upload", "deliveryUrl": "https://cdn.example.com/..." }, "upload": { "method": "PUT", "url": "https://s3...", "headers": {}, "expiresInSeconds": 900 } } }
   * @responseBody 422 - { "error": "MIME type is not supported for WhatsApp media", "code": "E_MEDIA_MIME_UNSUPPORTED" }
   * @responseBody 403 - { "error": "Permission denied: media:upload", "code": "PERMISSION_DENIED" }
   */
  async store({ request, serialize }: HttpContext) {
    const payload = await request.validateUsing(initiateMediaUploadValidator)

    const result = await new MediaAssetService().initiateUpload({
      organizationId: request.activeMember!.organizationId,
      uploadedBy: request.authUser!.id,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      fileSize: payload.fileSize,
    })

    return serialize(result)
  }

  /**
   * @complete
   * @summary Complete a media upload
   * @description Verifies the S3 object via HeadObject and marks the asset ready for WhatsApp sends.
   * @tag Media
   * @security BearerAuth
   * @paramPath id - Media asset id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "state": "ready", "deliveryUrl": "https://cdn.example.com/..." } }
   * @responseBody 404 - { "error": "Media asset not found", "code": "E_MEDIA_NOT_FOUND" }
   * @responseBody 422 - { "error": "Uploaded object was not found in storage", "code": "E_MEDIA_UPLOAD_INCOMPLETE" }
   */
  async complete({ request, params, serialize }: HttpContext) {
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
