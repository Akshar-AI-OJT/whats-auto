import type { HttpContext } from '@adonisjs/core/http'
import CampaignPolicy from '#policies/campaign_policy'
import { CampaignExecutionService } from '#services/campaign_execution_service'
import { CampaignService } from '#services/campaign_service'
import {
  campaignIdParamValidator,
  changeCampaignStatusValidator,
  createCampaignValidator,
  listCampaignsValidator,
  previewCampaignValidator,
  replaceCampaignRecipientsValidator,
  scheduleCampaignValidator,
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
  async index({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(CampaignPolicy).authorize('viewList')

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
  async show({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })

    const campaign = await new CampaignService().getCampaignById({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
    })

    await bouncer.with(CampaignPolicy).authorize('view', campaign)

    return serialize(campaign)
  }

  /**
   * @preview
   * @summary Preview a campaign message
   * @description Read-only preview of the campaign's linked WhatsApp template with placeholders replaced by sampleValues (or optional request overrides). Does not send messages or change campaign status.
   * @tag Campaigns
   * @security BearerAuth
   * @paramPath id - Campaign id - @type(string)
   * @requestBody { "variables": { "customer_name": "Priya" } }
   * @responseBody 200 - { "data": { "campaignId": "uuid", "campaignName": "July Product Launch", "bodyPreview": "Hello Priya, your Northstar order is on the way.", "variables": { "customer_name": "Priya" } } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: campaigns:view", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Campaign not found", "code": "E_CAMPAIGN_NOT_FOUND" }
   * @responseBody 422 - { "error": "Campaign has no message template configured", "code": "E_CAMPAIGN_TEMPLATE_NOT_CONFIGURED" }
   */
  async preview({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })

    const existing = await new CampaignService().getCampaignById({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
    })

    await bouncer.with(CampaignPolicy).authorize('preview', existing)

    const payload = await request.validateUsing(previewCampaignValidator)

    const preview = await new CampaignService().previewCampaign({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
      variables: payload.variables,
    })

    return serialize(preview)
  }

  /**
   * @send
   * @summary Send a campaign
   * @description Marks an eligible draft/scheduled campaign as sending and enqueues recipient fan-out. Soft-deleted campaigns return 404.
   * @tag Campaigns
   * @security BearerAuth
   * @paramPath id - Campaign id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "name": "July Product Launch", "status": "sending" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: campaigns:launch", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Campaign not found", "code": "E_CAMPAIGN_NOT_FOUND" }
   * @responseBody 422 - { "error": "Campaign with status \"sending\" is not eligible to send", "code": "E_CAMPAIGN_NOT_ELIGIBLE_TO_SEND" }
   */
  async send({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })

    const existing = await new CampaignService().getCampaignById({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
    })

    await bouncer.with(CampaignPolicy).authorize('send', existing)

    const campaign = await new CampaignService().sendCampaign({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
    })

    return serialize(campaign)
  }

  /**
   * @schedule
   * @summary Schedule a campaign
   * @description Sets scheduledAt to a future datetime, status to scheduled, and enqueues a delayed execute job. Soft-deleted campaigns return 404.
   * @tag Campaigns
   * @security BearerAuth
   * @paramPath id - Campaign id - @type(string)
   * @requestBody { "scheduledAt": "2026-08-07T10:00:00.000Z" }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "July Product Launch", "status": "scheduled", "scheduledAt": "2026-08-07T10:00:00.000Z" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: campaigns:edit", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Campaign not found", "code": "E_CAMPAIGN_NOT_FOUND" }
   * @responseBody 422 - { "error": "scheduledAt must be in the future", "code": "E_CAMPAIGN_SCHEDULED_AT_MUST_BE_FUTURE" }
   */
  async schedule({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })

    const existing = await new CampaignService().getCampaignById({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
    })

    await bouncer.with(CampaignPolicy).authorize('schedule', existing)

    const payload = await request.validateUsing(scheduleCampaignValidator)

    const campaign = await new CampaignService().scheduleCampaign({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
      scheduledAt: payload.scheduledAt,
    })

    return serialize(campaign)
  }

  /**
   * @cancel
   * @summary Cancel a scheduled or in-progress campaign
   * @description Scheduled campaigns revert to draft. In-progress (sending) campaigns are marked cancelled. Soft-deleted campaigns return 404.
   * @tag Campaigns
   * @security BearerAuth
   * @paramPath id - Campaign id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "name": "July Product Launch", "status": "draft" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: campaigns:pause", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Campaign not found", "code": "E_CAMPAIGN_NOT_FOUND" }
   * @responseBody 422 - { "error": "Campaign with status \"draft\" is not eligible to cancel schedule", "code": "E_CAMPAIGN_NOT_ELIGIBLE_TO_CANCEL" }
   */
  async cancel({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })
    const organizationId = request.activeMember!.organizationId

    const existing = await new CampaignService().getCampaignById({
      campaignId: id,
      organizationId,
    })

    await bouncer.with(CampaignPolicy).authorize('cancel', existing)

    const campaign =
      existing.status === 'sending'
        ? await new CampaignExecutionService().cancelCampaign({
            organizationId,
            campaignId: id,
          })
        : await new CampaignService().cancelScheduledCampaign({
            campaignId: id,
            organizationId,
          })

    return serialize(campaign)
  }

  /**
   * @replaceRecipients
   * @summary Replace campaign recipients
   * @description Replaces the recipient snapshot for a draft or scheduled campaign.
   * @tag Campaigns
   * @security BearerAuth
   * @paramPath id - Campaign id - @type(string)
   * @requestBody { "contactIds": ["uuid"], "variables": { "name": "Ada" } }
   * @responseBody 200 - { "data": { "id": "uuid", "totalRecipients": 1 } }
   */
  async replaceRecipients({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })

    const existing = await new CampaignService().getCampaignById({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
    })

    await bouncer.with(CampaignPolicy).authorize('replaceRecipients', existing)

    const payload = await request.validateUsing(replaceCampaignRecipientsValidator)

    const campaign = await new CampaignExecutionService().replaceRecipients({
      organizationId: request.activeMember!.organizationId,
      campaignId: id,
      contactIds: payload.contactIds,
      variables: payload.variables,
    })

    return serialize(campaign)
  }

  /**
   * @duplicate
   * @summary Duplicate a campaign
   * @description Creates a new draft campaign from an existing one. Does not copy id, timestamps, schedule, delivery counters, or soft-delete state. Soft-deleted sources return 404.
   * @tag Campaigns
   * @security BearerAuth
   * @paramPath id - Campaign id to duplicate - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "name": "July Product Launch", "status": "draft", "totalRecipients": 0 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: campaigns:create", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Campaign not found", "code": "E_CAMPAIGN_NOT_FOUND" }
   */
  async duplicate({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })

    const existing = await new CampaignService().getCampaignById({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
    })

    await bouncer.with(CampaignPolicy).authorize('duplicate', existing)

    const campaign = await new CampaignService().duplicateCampaign({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
      actorUserId: request.authUser!.id,
    })

    return serialize(campaign)
  }

  /**
   * @changeStatus
   * @summary Change campaign status
   * @description Updates only the campaign status to an active lifecycle value (draft, scheduled, sending, sent, failed). Soft-deleted campaigns return 404. Does not change other fields.
   * @tag Campaigns
   * @security BearerAuth
   * @paramPath id - Campaign id - @type(string)
   * @requestBody { "status": "sent" }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "July Product Launch", "status": "sent" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: campaigns:edit", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Campaign not found", "code": "E_CAMPAIGN_NOT_FOUND" }
   * @responseBody 422 - { "error": "Validation failed", "code": "E_VALIDATION_ERROR" }
   */
  async changeStatus({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })

    const existing = await new CampaignService().getCampaignById({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
    })

    await bouncer.with(CampaignPolicy).authorize('changeStatus', existing)

    const payload = await request.validateUsing(changeCampaignStatusValidator)

    const campaign = await new CampaignService().changeCampaignStatus({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
      status: payload.status,
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
  async store({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(CampaignPolicy).authorize('create')

    const payload = await request.validateUsing(createCampaignValidator)

    const campaign = await new CampaignService().createCampaign({
      organizationId: request.activeMember!.organizationId,
      actorUserId: request.authUser!.id,
      name: payload.name,
      whatsappConfigId: payload.whatsappConfigId,
      messageTemplateId: payload.messageTemplateId,
      headerMediaAssetId: payload.headerMediaAssetId,
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
  async update({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })

    const existing = await new CampaignService().getCampaignById({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
    })

    await bouncer.with(CampaignPolicy).authorize('update', existing)

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
  async softDelete({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })

    const existing = await new CampaignService().getCampaignById({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
    })

    await bouncer.with(CampaignPolicy).authorize('delete', existing)

    const result = await new CampaignService().softDeleteCampaign({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
    })

    return serialize(result)
  }
}
