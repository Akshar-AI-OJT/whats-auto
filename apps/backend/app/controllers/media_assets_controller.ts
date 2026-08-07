import type { HttpContext } from '@adonisjs/core/http'
import { MediaAssetService } from '#services/media_asset_service'
import { listMediaLibraryValidator, mediaAssetIdParamValidator } from '#validators/media'
import '#types/http'

/**
 * Media Library list/detail/lifecycle HTTP adapter.
 * Upload initiate/complete remain on MediaUploadsController.
 */
export default class MediaAssetsController {
  /**
   * @index
   * @summary List Media Library assets
   * @tag Media
   * @security BearerAuth
   * @paramQuery page - Page number - @type(number)
   * @paramQuery perPage - Page size - @type(number)
   * @paramQuery kind - image or document - @type(string)
   * @paramQuery state - ready or deleted - @type(string)
   * @paramQuery search - Filename search - @type(string)
   * @responseBody 200 - { "data": [{ "id": "uuid", "fileName": "a.jpg", "kind": "image", "state": "ready" }], "meta": { "total": 1, "perPage": 20, "currentPage": 1, "lastPage": 1 } }
   */
  async index({ request, serialize }: HttpContext) {
    const params = await request.validateUsing(listMediaLibraryValidator, {
      data: request.qs(),
    })

    const result = await new MediaAssetService().listLibrary({
      organizationId: request.activeMember!.organizationId,
      page: params.page,
      perPage: params.perPage ?? params.limit,
      state: params.state,
      kind: params.kind,
      search: params.search,
    })

    return serialize(result)
  }

  /**
   * @quota
   * @summary Organization storage quota usage
   * @tag Media
   * @security BearerAuth
   * @responseBody 200 - { "data": { "readyBytes": 0, "reservedBytes": 0, "usedBytes": 0, "limitBytes": 1073741824 } }
   */
  async quota({ request, serialize }: HttpContext) {
    const data = await new MediaAssetService().getQuota(request.activeMember!.organizationId)
    return serialize(data)
  }

  /**
   * @show
   * @summary Get one Media Library asset
   * @tag Media
   * @security BearerAuth
   * @paramPath id - Media asset id - @type(string)
   */
  async show({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(mediaAssetIdParamValidator, { data: params })
    const asset = await new MediaAssetService().getLibraryAsset({
      organizationId: request.activeMember!.organizationId,
      mediaAssetId: id,
    })
    return serialize(asset)
  }

  /**
   * @destroy
   * @summary Soft-delete a Media Library asset
   * @tag Media
   * @security BearerAuth
   * @paramPath id - Media asset id - @type(string)
   */
  async destroy({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(mediaAssetIdParamValidator, { data: params })
    const asset = await new MediaAssetService().softDelete({
      organizationId: request.activeMember!.organizationId,
      mediaAssetId: id,
    })
    return serialize(asset)
  }

  /**
   * @restore
   * @summary Restore a soft-deleted Media Library asset
   * @tag Media
   * @security BearerAuth
   * @paramPath id - Media asset id - @type(string)
   */
  async restore({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(mediaAssetIdParamValidator, { data: params })
    const asset = await new MediaAssetService().restore({
      organizationId: request.activeMember!.organizationId,
      mediaAssetId: id,
    })
    return serialize(asset)
  }

  /**
   * @purge
   * @summary Permanently purge a Media Library asset (Owner)
   * @tag Media
   * @security BearerAuth
   * @paramPath id - Media asset id - @type(string)
   */
  async purge({ request, params, response }: HttpContext) {
    const { id } = await request.validateUsing(mediaAssetIdParamValidator, { data: params })
    await new MediaAssetService().purge({
      organizationId: request.activeMember!.organizationId,
      mediaAssetId: id,
    })
    return response.ok({ data: { ok: true } })
  }
}
