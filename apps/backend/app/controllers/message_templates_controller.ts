import type { HttpContext } from '@adonisjs/core/http'
import { MessageTemplateService } from '#services/message_template_service'
import {
  createMessageTemplateValidator,
  listMessageTemplatesValidator,
  templateIdParamValidator,
} from '#validators/message_template'
import '#types/http'

export default class MessageTemplatesController {
  /**
   * @index
   * @summary List message templates for active organization
   * @description Returns paginated list of WhatsApp message templates. Requires whatsapp:view or templates:view permission.
   * @tag WhatsApp Templates
   * @security BearerAuth
   * @paramQuery page - Page number (default 1) - @type(number)
   * @paramQuery perPage - Items per page (1-100, default 20) - @type(number)
   * @paramQuery status - Filter by status (approved, pending, rejected, draft) - @type(string)
   * @paramQuery category - Filter by category (UTILITY, MARKETING, AUTHENTICATION) - @type(string)
   * @paramQuery search - Search term for template name or body text - @type(string)
   * @responseBody 200 - { "data": [{ "id": "uuid", "name": "order_update", "category": "UTILITY", "language": "en_US", "status": "approved", "bodyText": "Hello {{1}}" }], "meta": { "total": 1, "perPage": 20, "currentPage": 1, "lastPage": 1 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: whatsapp:view", "code": "PERMISSION_DENIED" }
   */
  async index({ request, serialize }: HttpContext) {
    const params = await request.validateUsing(listMessageTemplatesValidator, {
      data: request.qs(),
    })

    const templates = await new MessageTemplateService().listTemplatesPaginated(params)
    return serialize(templates)
  }

  /**
   * @show
   * @summary Get a message template by ID
   * @description Detail view of a message template. Requires whatsapp:view or templates:view permission.
   * @tag WhatsApp Templates
   * @security BearerAuth
   * @paramPath id - Template ID - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "name": "order_update", "category": "UTILITY", "language": "en_US", "status": "approved", "bodyText": "Hello {{1}}" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 404 - { "error": "Message template not found", "code": "E_MESSAGE_TEMPLATE_NOT_FOUND" }
   */
  async show({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(templateIdParamValidator, {
      data: params,
    })

    const template = await new MessageTemplateService().getTemplateById(id)
    return serialize(template)
  }

  /**
   * @store
   * @summary Create a message template & submit to Meta
   * @description Creates a template locally and submits to Meta Graph API for review. Requires whatsapp:manage or templates:create permission.
   * @tag WhatsApp Templates
   * @security BearerAuth
   * @requestBody { "name": "order_confirmation_v2", "category": "UTILITY", "language": "en_US", "headerType": "TEXT", "headerContent": "Order Update", "bodyText": "Your order {{1}} is confirmed.", "footerText": "Thank you for shopping" }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "order_confirmation_v2", "status": "pending", "category": "UTILITY" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 409 - { "error": "Template \"order_confirmation_v2\" (en_US) already exists", "code": "E_MESSAGE_TEMPLATE_DUPLICATE" }
   */
  async store({ request, serialize }: HttpContext) {
    const payload = await request.validateUsing(createMessageTemplateValidator)

    const template = await new MessageTemplateService().createTemplate({
      organizationId: request.activeOrganizationId!,
      userId: request.authUser?.id,
      ...payload,
    })

    return serialize(template)
  }

  /**
   * @sync
   * @summary Sync message templates from Meta WABA account
   * @description Fetches all approved, pending, and rejected templates from Meta WABA and syncs into local DB. Requires whatsapp:manage or templates:sync permission.
   * @tag WhatsApp Templates
   * @security BearerAuth
   * @responseBody 200 - { "data": { "syncedCount": 5 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 422 - { "error": "No connected WhatsApp configuration found", "code": "E_WA_CONFIG_NOT_FOUND" }
   */
  async sync({ request, serialize }: HttpContext) {
    const result = await new MessageTemplateService().syncTemplatesFromMeta(
      request.activeOrganizationId!
    )
    return serialize(result)
  }

  /**
   * @destroy
   * @summary Delete a message template
   * @description Deletes template from local database and Meta Graph API. Requires whatsapp:manage or templates:delete permission.
   * @tag WhatsApp Templates
   * @security BearerAuth
   * @paramPath id - Template ID - @type(string)
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 404 - { "error": "Message template not found", "code": "E_MESSAGE_TEMPLATE_NOT_FOUND" }
   */
  async destroy({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(templateIdParamValidator, {
      data: params,
    })

    const result = await new MessageTemplateService().deleteTemplate(id)
    return serialize(result)
  }
}
