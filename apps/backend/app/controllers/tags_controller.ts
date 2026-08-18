import type { HttpContext } from '@adonisjs/core/http'
import { TagService } from '#services/tag_service'
import {
  assignTagContactValidator,
  createTagValidator,
  tagContactParamsValidator,
  tagIdParamValidator,
  updateTagValidator,
} from '#validators/tag'
import '#types/http'

export default class TagsController {
  /**
   * @index
   * @summary List contact tags for the active organization
   * @description RLS-scoped grouping tags. contactCount counts non-deleted assigned contacts.
   * @tag Contacts
   * @security BearerAuth
   * @responseBody 200 - { "data": [{ "id": "uuid", "name": "VIP", "color": "#22C55E", "description": null, "status": "active", "contactCount": 0, "usedInCampaigns": 0, "createdAt": "2026-08-13T12:00:00.000Z" }] }
   * @responseBody 403 - { "error": "Permission denied: contacts:view", "code": "PERMISSION_DENIED" }
   */
  async index({ request, serialize }: HttpContext) {
    const tags = await new TagService().listTags(request.activeMember!.organizationId)
    return serialize(tags)
  }

  /**
   * @store
   * @summary Create a contact tag in the active organization
   * @tag Contacts
   * @security BearerAuth
   * @requestBody { "name": "VIP", "color": "#22C55E", "description": "Wholesale buyers" }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "VIP", "color": "#22C55E", "description": "Wholesale buyers", "status": "active", "contactCount": 0, "usedInCampaigns": 0 } }
   * @responseBody 403 - { "error": "Permission denied: contacts:create", "code": "PERMISSION_DENIED" }
   * @responseBody 409 - { "error": "A tag with this name already exists", "code": "E_TAG_NAME_EXISTS" }
   */
  async store({ request, serialize }: HttpContext) {
    const payload = await request.validateUsing(createTagValidator)

    const tag = await new TagService().createTag({
      organizationId: request.activeMember!.organizationId,
      actorUserId: request.authUser!.id,
      name: payload.name,
      color: payload.color,
      description: payload.description,
    })
    return serialize(tag)
  }

  /**
   * @show
   * @summary Get a contact tag by id
   * @tag Contacts
   * @security BearerAuth
   * @paramPath id - Tag id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "name": "VIP", "color": "#22C55E", "description": null, "status": "active", "contactCount": 1, "usedInCampaigns": 0 } }
   * @responseBody 404 - { "error": "Tag not found", "code": "E_TAG_NOT_FOUND" }
   */
  async show({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(tagIdParamValidator, {
      data: params,
    })

    const tag = await new TagService().getTagById({
      organizationId: request.activeMember!.organizationId,
      tagId: id,
    })
    return serialize(tag)
  }

  /**
   * @update
   * @summary Update a contact tag
   * @description Partial update. Provide at least one of name, color, description, or status.
   * @tag Contacts
   * @security BearerAuth
   * @paramPath id - Tag id - @type(string)
   * @requestBody { "name": "Wholesale", "color": "#000000", "description": "B2B accounts", "status": "active" }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Wholesale", "color": "#000000", "description": "B2B accounts", "status": "active" } }
   * @responseBody 404 - { "error": "Tag not found", "code": "E_TAG_NOT_FOUND" }
   * @responseBody 409 - { "error": "A tag with this name already exists", "code": "E_TAG_NAME_EXISTS" }
   * @responseBody 422 - { "error": "Provide at least one of name, color, description, or status", "code": "E_TAG_EMPTY_UPDATE" }
   */
  async update({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(tagIdParamValidator, {
      data: params,
    })
    const payload = await request.validateUsing(updateTagValidator)

    const tag = await new TagService().updateTag({
      organizationId: request.activeMember!.organizationId,
      tagId: id,
      name: payload.name,
      color: payload.color,
      description: payload.description,
      status: payload.status,
    })
    return serialize(tag)
  }

  /**
   * @destroy
   * @summary Delete a contact tag
   * @description Hard-deletes the tag. Assigned contact_tags rows cascade. Contacts are not deleted.
   * @tag Contacts
   * @security BearerAuth
   * @paramPath id - Tag id - @type(string)
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 403 - { "error": "Permission denied: contacts:delete", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Tag not found", "code": "E_TAG_NOT_FOUND" }
   */
  async destroy({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(tagIdParamValidator, {
      data: params,
    })

    const result = await new TagService().deleteTag({
      organizationId: request.activeMember!.organizationId,
      tagId: id,
    })
    return serialize(result)
  }

  /**
   * @contacts
   * @summary List non-deleted contacts assigned to a tag
   * @tag Contacts
   * @security BearerAuth
   * @paramPath id - Tag id - @type(string)
   * @responseBody 200 - { "data": [{ "id": "uuid", "phone": "+15551234567", "name": "Ada" }] }
   * @responseBody 404 - { "error": "Tag not found", "code": "E_TAG_NOT_FOUND" }
   */
  async contacts({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(tagIdParamValidator, {
      data: params,
    })

    const contacts = await new TagService().listTagContacts({
      organizationId: request.activeMember!.organizationId,
      tagId: id,
    })
    return serialize(contacts)
  }

  /**
   * @assignContact
   * @summary Assign a contact to a tag
   * @tag Contacts
   * @security BearerAuth
   * @paramPath id - Tag id - @type(string)
   * @requestBody { "contactId": "uuid" }
   * @responseBody 200 - { "data": { "id": "uuid", "organizationId": "uuid", "tagId": "uuid", "contactId": "uuid" } }
   * @responseBody 403 - { "error": "Permission denied: contacts:edit", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Tag not found", "code": "E_TAG_NOT_FOUND" }
   * @responseBody 409 - { "error": "This contact is already assigned to the tag", "code": "E_TAG_ASSIGNMENT_EXISTS" }
   * @responseBody 422 - { "error": "Contact not found for this organization", "code": "E_TAG_INVALID_CONTACT" }
   */
  async assignContact({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(tagIdParamValidator, {
      data: params,
    })
    const payload = await request.validateUsing(assignTagContactValidator)

    const assignment = await new TagService().assignContact({
      organizationId: request.activeMember!.organizationId,
      tagId: id,
      contactId: payload.contactId,
    })
    return serialize(assignment)
  }

  /**
   * @removeContact
   * @summary Remove a contact from a tag
   * @tag Contacts
   * @security BearerAuth
   * @paramPath id - Tag id - @type(string)
   * @paramPath contactId - Contact id - @type(string)
   * @responseBody 200 - { "data": { "ok": true } }
   * @responseBody 403 - { "error": "Permission denied: contacts:edit", "code": "PERMISSION_DENIED" }
   * @responseBody 404 - { "error": "Tag assignment not found", "code": "E_TAG_ASSIGNMENT_NOT_FOUND" }
   */
  async removeContact({ request, params, serialize }: HttpContext) {
    const { id, contactId } = await request.validateUsing(tagContactParamsValidator, {
      data: params,
    })

    const result = await new TagService().removeContact({
      organizationId: request.activeMember!.organizationId,
      tagId: id,
      contactId,
    })
    return serialize(result)
  }
}
