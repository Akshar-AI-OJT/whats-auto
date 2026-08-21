import type { HttpContext } from '@adonisjs/core/http'
import CampaignException from '#exceptions/campaign_exception'
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
  type CampaignVariableMappings,
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
  async preview({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })
    const payload = await request.validateUsing(previewCampaignValidator)

    const preview = await new CampaignService().previewCampaign({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
      variables: payload.variables,
    })

    return serialize(preview)
  }

  /**
   * @replaceRecipients
   * @summary Replace campaign recipients
   * @description Replaces the recipient snapshot for a draft or scheduled campaign. Provide either contactIds (All Contacts) or tagId (customer group). Soft-deleted and opted-out contacts are excluded. Group targeting stores audienceTagId so later launch can refresh membership.
   * @tag Campaigns
   * @security BearerAuth
   * @paramPath id - Campaign id - @type(string)
   * @requestBody { "contactIds": ["uuid"] }
   * @requestBody { "tagId": "uuid" }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "July Product Launch", "status": "draft", "totalRecipients": 1 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: campaigns:edit", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Tag not found", "code": "E_CAMPAIGN_TAG_NOT_FOUND" }
   * @responseBody 422 - { "error": "Provide either contactIds or tagId, not both", "code": "E_CAMPAIGN_CONFLICTING_AUDIENCE" }
   * @responseBody 422 - { "error": "Provide either contactIds or tagId", "code": "E_CAMPAIGN_RECIPIENTS_AUDIENCE_REQUIRED" }
   */
  async replaceRecipients({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, { data: params })
    const payload = await request.validateUsing(replaceCampaignRecipientsValidator)

    if (payload.tagId && payload.contactIds !== undefined) {
      throw CampaignException.conflictingAudience()
    }
    if (!payload.tagId && payload.contactIds === undefined) {
      throw CampaignException.recipientsAudienceRequired()
    }

    const campaign = await new CampaignService().replaceRecipients({
      organizationId: request.activeMember!.organizationId,
      campaignId: id,
      contactIds: payload.contactIds,
      tagId: payload.tagId,
      variables: payload.variables,
    })

    return serialize(campaign)
  }

  /**
   * @send
   * @summary Send a campaign
   * @description Marks an eligible draft/scheduled campaign as sending (running). Customer-group campaigns re-resolve live group membership and skip opted-out contacts. Soft-deleted campaigns return 404.
   * @tag Campaigns
   * @security BearerAuth
   * @paramPath id - Campaign id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "name": "July Product Launch", "status": "sending" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: campaigns:launch", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Campaign not found", "code": "E_CAMPAIGN_NOT_FOUND" }
   * @responseBody 422 - { "error": "Campaign has no eligible recipients after excluding opted-out and deleted contacts", "code": "E_CAMPAIGN_NO_ELIGIBLE_RECIPIENTS" }
   * @responseBody 422 - { "error": "Campaign with status \"sending\" is not eligible to send", "code": "E_CAMPAIGN_NOT_ELIGIBLE_TO_SEND" }
   */
  async send({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })

    const campaign = await new CampaignService().sendCampaign({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
    })

    return serialize(campaign)
  }

  /**
   * @schedule
   * @summary Schedule a campaign
   * @description Sets scheduledAt to a future datetime and status to scheduled. Enqueues a delayed campaign.execute job; the worker launches at that instant without a manual send. Naive datetimes use optional timeZone, otherwise the organization timezone. Soft-deleted campaigns return 404.
   * @tag Campaigns
   * @security BearerAuth
   * @paramPath id - Campaign id - @type(string)
   * @requestBody { "scheduledAt": "2026-08-07T10:00:00.000Z", "timeZone": "Asia/Kolkata" }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "July Product Launch", "status": "scheduled", "scheduledAt": "2026-08-07T10:00:00.000Z" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: campaigns:edit", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Campaign not found", "code": "E_CAMPAIGN_NOT_FOUND" }
   * @responseBody 422 - { "error": "scheduledAt must be in the future", "code": "E_CAMPAIGN_SCHEDULED_AT_MUST_BE_FUTURE" }
   */
  async schedule({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })
    const payload = await request.validateUsing(scheduleCampaignValidator)

    const campaign = await new CampaignService().scheduleCampaign({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
      scheduledAt: payload.scheduledAt,
      timeZone: payload.timeZone,
    })

    return serialize(campaign)
  }

  /**
   * @cancel
   * @summary Cancel a scheduled or sending campaign
   * @description Reverts a scheduled or in-flight campaign to draft and clears scheduledAt. No request body is required. Soft-deleted campaigns return 404. Removes the delayed execute job when the queue driver supports it.
   * @tag Campaigns
   * @security BearerAuth
   * @paramPath id - Campaign id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "name": "July Product Launch", "status": "draft" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: campaigns:pause", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Campaign not found", "code": "E_CAMPAIGN_NOT_FOUND" }
   * @responseBody 422 - { "error": "Campaign with status \"draft\" is not eligible to cancel schedule", "code": "E_CAMPAIGN_NOT_ELIGIBLE_TO_CANCEL" }
   */
  async cancel({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: { id: params.id },
    })

    const campaign = await new CampaignService().cancelScheduledCampaign({
      campaignId: id,
      organizationId: request.activeMember!.organizationId,
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
  async duplicate({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })

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
  async changeStatus({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: params,
    })
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
      variableMappings: payload.variableMappings as CampaignVariableMappings | undefined,
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
      variableMappings: payload.variableMappings as CampaignVariableMappings | null | undefined,
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
