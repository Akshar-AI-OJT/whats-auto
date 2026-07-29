import type { HttpContext } from '@adonisjs/core/http'
import { ContactService } from '#services/contact_service'
import { createContactValidator } from '#validators/contact'
import '#types/http'

export default class ContactsController {
  /**
   * @index
   * @summary List contacts for the active organization
   * @description RLS-scoped sample business table. Rows from other orgs are invisible even if queried without an app-level organizationId filter.
   * @tag Contacts
   * @security BearerAuth
   * @responseBody 200 - { "data": [{ "id": "uuid", "organizationId": "uuid", "phone": "+15551234567", "createdAt": "2026-07-23T12:00:00.000Z" }] }
   * @responseBody 403 - { "error": "Permission denied: contacts:view", "code": "PERMISSION_DENIED" }
   */
  async index({ serialize }: HttpContext) {
    const contacts = await new ContactService().listContacts()
    return serialize(contacts)
  }

  /**
   * @store
   * @summary Create a contact in the active organization
   * @tag Contacts
   * @security BearerAuth
   * @requestBody { "phone": "+15551234567" }
   * @responseBody 200 - { "data": { "id": "uuid", "organizationId": "uuid", "phone": "+15551234567", "createdAt": "2026-07-23T12:00:00.000Z" } }
   * @responseBody 403 - { "error": "Permission denied: contacts:create", "code": "PERMISSION_DENIED" }
   */
  async store({ request, serialize }: HttpContext) {
    const payload = await request.validateUsing(createContactValidator)
    const contact = await new ContactService().createContact(
      request.activeMember!.organizationId,
      payload.phone
    )
    return serialize(contact)
  }
}
