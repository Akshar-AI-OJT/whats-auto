import type { HttpContext } from '@adonisjs/core/http'
import ContactPolicy from '#policies/contact_policy'
import { ContactService } from '#services/contact_service'
import { createContactValidator } from '#validators/contact'
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
  async index({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(ContactPolicy).authorize('viewAny')

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
  async store({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(ContactPolicy).authorize('create')

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
}
