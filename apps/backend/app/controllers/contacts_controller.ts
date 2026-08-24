import type { HttpContext } from '@adonisjs/core/http'
import { readFile } from 'node:fs/promises'
import ContactException from '#exceptions/contact_exception'
import ContactPolicy from '#policies/contact_policy'
import { ContactImportService } from '#services/contact_import_service'
import { ContactService } from '#services/contact_service'
import {
  contactIdParamValidator,
  createContactValidator,
  importContactsValidator,
} from '#validators/contact'
import '#types/http'

export default class ContactsController {
  /**
   * @index
   * @summary List contacts for the active organization
   * @description RLS-scoped. Soft-deleted contacts are omitted.
   * @tag Contacts
   * @security BearerAuth
   * @responseBody 200 - { "data": [{ "id": "uuid", "phone": "9876543210", "phoneNormalized": "919876543210", "name": "Ada", "email": "ada@example.com", "company": "Acme", "createdAt": "2026-07-23T12:00:00.000Z" }] }
   * @responseBody 403 - { "error": "Permission denied: contacts:view", "code": "PERMISSION_DENIED" }
   */
  async index({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(ContactPolicy).authorize('viewAny')

    const contacts = await new ContactService().listContacts(request.activeMember!.organizationId)
    return serialize(contacts)
  }

  /**
   * @store
   * @summary Create a contact in the active organization
   * @description National numbers require countryCode (ISO 3166-1 alpha-2). International numbers beginning with + may omit countryCode.
   * @tag Contacts
   * @security BearerAuth
   * @requestBody { "phoneNumber": "9876543210", "countryCode": "IN", "name": "Ada Lovelace", "email": "ada@example.com", "company": "Acme" }
   * @responseBody 200 - { "data": { "id": "uuid", "phone": "9876543210", "phoneNormalized": "919876543210", "name": "Ada Lovelace", "email": "ada@example.com", "company": "Acme" } }
   * @responseBody 403 - { "error": "Permission denied: contacts:create", "code": "PERMISSION_DENIED" }
   * @responseBody 409 - { "error": "A contact with this phone number already exists", "code": "E_CONTACT_PHONE_EXISTS" }
   * @responseBody 422 - { "error": "Enter a valid phone number", "code": "E_CONTACT_PHONE_INVALID" }
   */
  async store({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(ContactPolicy).authorize('create')

    const payload = await request.validateUsing(createContactValidator)

    const contact = await new ContactService().createContact({
      organizationId: request.activeMember!.organizationId,
      actorUserId: request.authUser!.id,
      phoneNumber: payload.phoneNumber,
      countryCode: payload.countryCode,
      name: payload.name,
      email: payload.email,
      company: payload.company,
    })
    return serialize(contact)
  }

  /**
   * @importCsv
   * @summary Import contacts from a CSV file
   * @description Multipart upload. National numbers use defaultCountryCode (ISO 3166-1 alpha-2). International numbers beginning with + do not use the default country. Invalid rows are recorded and skipped.
   * @tag Contacts
   * @security BearerAuth
   * @responseBody 200 - { "data": { "id": "uuid", "status": "completed", "defaultCountryCode": "IN", "totalRows": 3, "successCount": 2, "errorCount": 1 } }
   * @responseBody 403 - { "error": "Permission denied: contacts:import", "code": "PERMISSION_DENIED" }
   * @responseBody 422 - { "error": "CSV is missing a phone column", "code": "E_CONTACT_IMPORT_MISSING_PHONE_COLUMN" }
   */
  async importCsv({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(ContactPolicy).authorize('import')

    const csvFile = request.file('file', {
      size: '2mb',
      extnames: ['csv', 'txt'],
    })
    if (!csvFile || !csvFile.isValid || !csvFile.tmpPath) {
      throw ContactException.importInvalidFile()
    }

    let columnMapping = request.input('columnMapping')
    if (typeof columnMapping === 'string' && columnMapping.trim()) {
      try {
        columnMapping = JSON.parse(columnMapping)
      } catch {
        throw ContactException.importMalformed()
      }
    }

    const payload = await request.validateUsing(importContactsValidator, {
      data: {
        defaultCountryCode: request.input('defaultCountryCode') || undefined,
        columnMapping:
          columnMapping && typeof columnMapping === 'object' && !Array.isArray(columnMapping)
            ? columnMapping
            : undefined,
      },
    })

    const csvContent = await readFile(csvFile.tmpPath, 'utf8')
    const result = await new ContactImportService().importCsv({
      organizationId: request.activeMember!.organizationId,
      actorUserId: request.authUser!.id,
      fileName: csvFile.clientName || 'contacts.csv',
      csvContent,
      columnMapping: payload.columnMapping,
      defaultCountryCode: payload.defaultCountryCode ?? undefined,
    })
    return serialize(result)
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
  async softDelete({ bouncer, request, params, serialize }: HttpContext) {
    await bouncer.with(ContactPolicy).authorize('delete')

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
