import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import CampaignException from '#exceptions/campaign_exception'
import { campaignIdParamValidator } from '#validators/campaign'
import '#types/http'

export default class TagsController {
  /**
   * @index
   * @summary List customer groups (tags)
   * @tag Contacts
   * @security BearerAuth
   */
  async index({ request, serialize }: HttpContext) {
    const organizationId = request.activeMember!.organizationId
    const rows = await db
      .from('tags')
      .where('organizationId', organizationId)
      .select('id', 'name', 'color', 'createdAt')
      .orderBy('name', 'asc')

    return serialize(
      rows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        color: (row.color as string | null) ?? null,
        status: 'active',
        createdAt: row.createdAt,
      }))
    )
  }

  /**
   * @contacts
   * @summary List live contacts in a customer group
   * @tag Contacts
   * @security BearerAuth
   */
  async contacts({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(campaignIdParamValidator, {
      data: { id: params.id },
    })
    const organizationId = request.activeMember!.organizationId

    const tag = await db
      .from('tags')
      .where('id', id)
      .where('organizationId', organizationId)
      .select('id')
      .first()
    if (!tag) {
      throw CampaignException.tagNotFound()
    }

    const rows = await db
      .from('contact_tags as ct')
      .innerJoin('contacts as c', 'c.id', 'ct.contactId')
      .where('ct.tagId', id)
      .where('ct.organizationId', organizationId)
      .where('c.organizationId', organizationId)
      .whereNull('c.deletedAt')
      .whereNull('c.optedOutAt')
      .select(
        'c.id',
        'c.organizationId',
        'c.phone',
        'c.phoneNormalized',
        'c.name',
        'c.email',
        'c.company',
        'c.createdAt',
        'c.updatedAt'
      )
      .orderBy('c.name', 'asc')

    return serialize(rows)
  }
}
