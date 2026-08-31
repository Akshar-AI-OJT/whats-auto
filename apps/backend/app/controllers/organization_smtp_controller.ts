import type { HttpContext } from '@adonisjs/core/http'
import OrganizationPolicy from '#policies/organization_policy'
import { OrganizationSmtpService } from '#services/organization_smtp_service'
import { transformOrganizationSmtp } from '#transformers/organization_smtp_transformer'
import {
  testOrganizationSmtpValidator,
  upsertOrganizationSmtpValidator,
} from '#validators/organization_smtp'
import '#types/http'

export default class OrganizationSmtpController {
  /**
   * @show
   * @summary Get organization SMTP configuration
   * @tag Organizations
   * @security BearerAuth
   * @responseBody 200 - { "data": { "transport": "smtp", "hasPassword": true } }
   * @responseBody 404 - { "error": "No custom SMTP configuration found for this organization", "code": "E_SMTP_CONFIG_NOT_FOUND" }
   */
  async show({ bouncer, params, serialize }: HttpContext) {
    await bouncer.with(OrganizationPolicy).authorize('update', params.id)

    const row = await new OrganizationSmtpService().getConfig(params.id)
    if (!row) {
      return serialize({ data: null })
    }
    return serialize({ data: transformOrganizationSmtp(row) })
  }

  /**
   * @update
   * @summary Save and verify organization SMTP configuration
   * @tag Organizations
   * @security BearerAuth
   * @responseBody 200 - { "data": { "status": "verified" } }
   * @responseBody 422 - { "error": "SMTP connection failed: ...", "code": "E_SMTP_CONNECTION_FAILED" }
   */
  async update({ bouncer, request, params, serialize }: HttpContext) {
    await bouncer.with(OrganizationPolicy).authorize('update', params.id)

    const payload = await request.validateUsing(upsertOrganizationSmtpValidator)
    const row = await new OrganizationSmtpService().upsertConfig({
      organizationId: params.id,
      actorUserId: request.authUser!.id,
      data: payload,
    })
    return serialize({ data: transformOrganizationSmtp(row) })
  }

  /**
   * @test
   * @summary Test SMTP connection and send a test email
   * @tag Organizations
   * @security BearerAuth
   * @responseBody 200 - { "data": { "ok": true } }
   */
  async test({ bouncer, request, params }: HttpContext) {
    await bouncer.with(OrganizationPolicy).authorize('update', params.id)

    const payload = await request.validateUsing(testOrganizationSmtpValidator)
    await new OrganizationSmtpService().testConnection({
      organizationId: params.id,
      actorUserId: request.authUser!.id,
      userEmail: request.authUser!.email,
      draftConfig: payload.draftConfig,
    })
    return { data: { ok: true } }
  }

  /**
   * @destroy
   * @summary Remove custom SMTP configuration
   * @tag Organizations
   * @security BearerAuth
   * @responseBody 200 - { "data": { "deleted": true } }
   */
  async destroy({ bouncer, request, params }: HttpContext) {
    await bouncer.with(OrganizationPolicy).authorize('update', params.id)

    await new OrganizationSmtpService().deleteConfig({
      organizationId: params.id,
      actorUserId: request.authUser!.id,
    })
    return { data: { deleted: true } }
  }
}
