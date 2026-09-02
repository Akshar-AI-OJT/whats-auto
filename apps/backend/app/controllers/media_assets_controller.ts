import type { HttpContext } from '@adonisjs/core/http'
import MediaAssetPolicy from '#policies/media_asset_policy'
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
  async index({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(MediaAssetPolicy).authorize('viewList')

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
  async quota({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(MediaAssetPolicy).authorize('viewList')

    const data = await new MediaAssetService().getQuota(request.activeMember!.organizationId)
    return serialize(data)
  }

  /**
   * @organizationLogo
   * @summary Get the canonical organization profile logo (if any)
   * @tag Media
   * @security BearerAuth
   * @responseBody 200 - { "data": { "id": "uuid", "deliveryUrl": "https://…", "state": "ready" } }
   * @responseBody 200 - { "data": null }
   */
  async organizationLogo({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(MediaAssetPolicy).authorize('viewList')

    const logo = await new MediaAssetService().getOrganizationLogo({
      organizationId: request.activeMember!.organizationId,
    })
    return serialize(logo)
  }

  /**
   * @show
   * @summary Get one Media Library asset
   * @tag Media
   * @security BearerAuth
   * @paramPath id - Media asset id - @type(string)
   */
  async show({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(mediaAssetIdParamValidator, { data: params })

    const organizationId = request.activeMember!.organizationId
    const asset = await new MediaAssetService().getLibraryAsset({
      organizationId,
      mediaAssetId: id,
    })

    await bouncer.with(MediaAssetPolicy).authorize('view', {
      id: asset.id,
      organizationId,
      state: asset.state,
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
  async destroy({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(mediaAssetIdParamValidator, { data: params })

    const organizationId = request.activeMember!.organizationId
    const existing = await new MediaAssetService().getLibraryAsset({
      organizationId,
      mediaAssetId: id,
    })

    await bouncer.with(MediaAssetPolicy).authorize('delete', {
      id: existing.id,
      organizationId,
      state: existing.state,
    })

    const asset = await new MediaAssetService().softDelete({
      organizationId,
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
  async restore({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(mediaAssetIdParamValidator, { data: params })

    const organizationId = request.activeMember!.organizationId
    const existing = await new MediaAssetService().getLibraryAsset({
      organizationId,
      mediaAssetId: id,
    })

    await bouncer.with(MediaAssetPolicy).authorize('restore', {
      id: existing.id,
      organizationId,
      state: existing.state,
    })

    const asset = await new MediaAssetService().restore({
      organizationId,
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
  async purge({ bouncer, request, params, response }: HttpContext) {
    const { id } = await request.validateUsing(mediaAssetIdParamValidator, { data: params })

    const organizationId = request.activeMember!.organizationId
    const existing = await new MediaAssetService().getLibraryAsset({
      organizationId,
      mediaAssetId: id,
    })

    await bouncer.with(MediaAssetPolicy).authorize('purge', {
      id: existing.id,
      organizationId,
      state: existing.state,
    })

    await new MediaAssetService().purge({
      organizationId,
      mediaAssetId: id,
    })
    return response.ok({ data: { ok: true } })
  }
}
