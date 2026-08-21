import type { HttpContext } from '@adonisjs/core/http'
import { ContactService } from '#services/contact_service'
import { contactIdParamValidator, createContactValidator } from '#validators/contact'
import '#types/http'

export default class ContactsController {
  /**
   * @index
   * @summary List contacts for the active organization
   * @description RLS-scoped. Soft-deleted contacts are omitted.
   * @tag Contacts
   * @security BearerAuth
   * @responseBody 200 - { "data": [{ "id": "uuid", "phone": "+15551234567", "phoneNormalized": "15551234567", "name": "Ada", "email": "ada@example.com", "company": "Acme", "createdAt": "2026-07-23T12:00:00.000Z" }] }
   * @responseBody 403 - { "error": "Permission denied: contacts:view", "code": "PERMISSION_DENIED" }
   */
  async index({ request, serialize }: HttpContext) {
    const contacts = await new ContactService().listContacts(
      request.activeMember!.organizationId
    )
    return serialize(contacts)
  }

  /**
   * @store
   * @summary Create a contact in the active organization
   * @tag Contacts
   * @security BearerAuth
   * @requestBody { "phone": "+15551234567", "name": "Ada Lovelace", "email": "ada@example.com", "company": "Acme" }
   * @responseBody 200 - { "data": { "id": "uuid", "phone": "+15551234567", "phoneNormalized": "15551234567", "name": "Ada Lovelace", "email": "ada@example.com", "company": "Acme" } }
   * @responseBody 403 - { "error": "Permission denied: contacts:create", "code": "PERMISSION_DENIED" }
   * @responseBody 409 - { "error": "A contact with this phone number already exists", "code": "E_CONTACT_PHONE_EXISTS" }
   */
  async store({ request, serialize }: HttpContext) {
    const payload = await request.validateUsing(createContactValidator)

    const contact = await new ContactService().createContact({
      organizationId: request.activeMember!.organizationId,
      actorUserId: request.authUser!.id,
      phone: payload.phone,
      name: payload.name,
      email: payload.email,
      company: payload.company,
    })
    return serialize(contact)
  }

  /**
   * @softDelete
   * @summary Soft-delete a contact
   * @description Marks the contact as deleted without removing the row. Soft-deleted contacts are omitted from list.
   * @tag Contacts
   * @security BearerAuth
   * @paramPath id - Contact id - @type(string)
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: contacts:delete", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Contact not found", "code": "E_CONTACT_NOT_FOUND" }
   * @responseBody 409 - { "error": "Contact is already deleted", "code": "E_CONTACT_ALREADY_DELETED" }
   * @responseBody 422 - { "errors": [{ "field": "id", "message": "The id field must be a valid UUID" }] }
   */
  async softDelete({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(contactIdParamValidator, {
      data: params,
    })

    const result = await new ContactService().softDeleteContact({
      contactId: id,
      organizationId: request.activeMember!.organizationId,
    })

    return serialize(result)
  }
}
