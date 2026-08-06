import type { HttpContext } from '@adonisjs/core/http'
import { CampaignService } from '#services/campaign_service'
import {
  campaignIdParamValidator,
  createCampaignValidator,
  listCampaignsValidator,
  updateCampaignValidator,
} from '#validators/campaign'
import '#types/http'

export default class CampaignsController {
  /**
   * @index
   * @summary List campaigns
   * @description Paginated campaigns for the active organization. Supports search, status filter, and sorting.
   * @tag Campaigns
   * @security BearerAuth
   * @paramQuery page - Page number (default 1) - @type(number)
   * @paramQuery limit - Items per page (1-100, default 20); alias: perPage - @type(number)
   * @paramQuery search - Case-insensitive name search - @type(string)
   * @paramQuery status - Filter by status (draft, scheduled, sending, sent, failed) - @type(string)
   * @paramQuery sortBy - Sort field (default createdAt) - @type(string)
   * @paramQuery sortOrder - asc or desc (default desc) - @type(string)
   * @responseBody 200 - { "data": [{ "id": "uuid", "name": "July Product Launch", "status": "draft" }], "meta": { "total": 1, "perPage": 20, "currentPage": 1, "lastPage": 1 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: campaigns:view", "code": "PERMISSION_DENIED" }
   */
  async index({ request, serialize }: HttpContext) {
    const params = await request.validateUsing(listCampaignsValidator, {
      data: request.qs(),
    })

    const result = await new CampaignService().listCampaignsPaginated({
      organizationId: request.activeMember!.organizationId,
      ...params,
    })

    return serialize(result)
  }

  /**
   * @show
   * @summary Get a campaign by id
   * @description Returns full campaign details for the active organization.
   * @tag Campaigns
   * @security BearerAuth
   * @paramPath id - Campaign id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "name": "July Product Launch", "status": "draft", "totalRecipients": 0 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: campaigns:view", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Campaign not found", "code": "E_CAMPAIGN_NOT_FOUND" }
   */
  async show({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })

    const campaign = await new CampaignService().getCampaignById({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
    })

    return serialize(campaign)
  }

  /**
   * @store
   * @summary Create a campaign
   * @description Creates a draft or scheduled outbound campaign (broadcast) for the active organization.
   * @tag Campaigns
   * @security BearerAuth
   * @requestBody { "name": "July Product Launch", "messageTemplateId": "uuid", "whatsappConfigId": "uuid", "status": "draft" }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "July Product Launch", "status": "draft", "totalRecipients": 0 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: campaigns:create", "code": "PERMISSION_DENIED" }
   * @responseBody 422 - { "error": "Message template not found for this organization", "code": "E_CAMPAIGN_TEMPLATE_NOT_FOUND" }
   */
  async store({ request, serialize }: HttpContext) {
    const payload = await request.validateUsing(createCampaignValidator)

    const campaign = await new CampaignService().createCampaign({
      organizationId: request.activeMember!.organizationId,
      actorUserId: request.authUser!.id,
      name: payload.name,
      whatsappConfigId: payload.whatsappConfigId,
      messageTemplateId: payload.messageTemplateId,
      scheduledAt: payload.scheduledAt,
      status: payload.status,
    })

    return serialize(campaign)
  }

  /**
   * @update
   * @summary Update a campaign
   * @description Partial update of editable fields for a campaign in the active organization. Counters, org, creator, and createdAt are immutable.
   * @tag Campaigns
   * @security BearerAuth
   * @paramPath id - Campaign id - @type(string)
   * @requestBody { "name": "July Product Launch v2", "status": "scheduled", "scheduledAt": "2026-08-07T10:00:00.000Z" }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "July Product Launch v2", "status": "scheduled" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: campaigns:edit", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Campaign not found", "code": "E_CAMPAIGN_NOT_FOUND" }
   * @responseBody 422 - { "error": "scheduledAt is required when status is scheduled", "code": "E_CAMPAIGN_SCHEDULED_AT_REQUIRED" }
   */
  async update({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })
    const payload = await request.validateUsing(updateCampaignValidator)

    const campaign = await new CampaignService().updateCampaign({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
      ...payload,
    })

    return serialize(campaign)
  }

  /**
   * @softDelete
   * @summary Soft-delete a campaign
   * @description Marks the campaign as deleted without removing the row. Soft-deleted campaigns are omitted from list/get.
   * @tag Campaigns
   * @security BearerAuth
   * @paramPath id - Campaign id - @type(string)
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: campaigns:delete", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Campaign not found", "code": "E_CAMPAIGN_NOT_FOUND" }
   * @responseBody 409 - { "error": "Campaign is already deleted", "code": "E_CAMPAIGN_ALREADY_DELETED" }
   */
  async softDelete({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })

    const result = await new CampaignService().softDeleteCampaign({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
    })

    return serialize(result)
  }
}
