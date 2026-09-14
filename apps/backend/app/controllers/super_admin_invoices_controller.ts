import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import SuperAdminPolicy from '#policies/super_admin_policy'
import { InvoiceService } from '#services/billing/invoice_service'
import {
  createSuperAdminInvoiceValidator,
  invoiceIdParamValidator,
  invoiceSummaryValidator,
  listSuperAdminInvoicesValidator,
  markSuperAdminInvoicePaidValidator,
  regenerateSuperAdminInvoiceValidator,
} from '#validators/invoice_crud'
import '#types/http'

export default class SuperAdminInvoicesController {
  /**
   * @summary List invoices (Super Admin)
   * @description Platform-wide paginated invoice list with optional filters. Requires platform:tenants_billing.
   * @tag Super Admin
   * @security BearerAuth
   * @paramQuery page - Page number (default 1) - @type(number)
   * @paramQuery perPage - Items per page (1-100, default 20) - @type(number)
   * @paramQuery search - Search invoice number, organization, plan - @type(string)
   * @paramQuery status - paid | pending | overdue | cancelled | all - @type(string)
   * @paramQuery issueMonth - Filter by issue month (YYYY-MM) - @type(string)
   * @paramQuery billingPeriod - monthly | yearly | custom | all - @type(string)
   * @responseBody 200 - { "data": [{ "id": "uuid", "invoiceNumber": "INV-2026-000001", "status": "pending" }], "meta": { "total": 1, "perPage": 20, "currentPage": 1, "lastPage": 1 } }
   */
  @inject()
  async index({ bouncer, request, serialize }: HttpContext, invoices: InvoiceService) {
    await bouncer.with(SuperAdminPolicy).authorize('manageBilling')

    const query = await request.validateUsing(listSuperAdminInvoicesValidator, {
      data: request.qs(),
    })

    const result = await invoices.listInvoicesPaginated({
      page: query.page ?? 1,
      perPage: query.perPage ?? 20,
      filters: {
        search: query.search,
        status: query.status,
        issueMonth: query.issueMonth,
        billingPeriod: query.billingPeriod,
      },
    })

    return serialize.withoutWrapping(result)
  }

  /**
   * @summary Invoice summary KPIs (Super Admin)
   * @description Aggregated invoice counts and amounts for dashboard cards. Requires platform:tenants_billing.
   * @tag Super Admin
   * @security BearerAuth
   * @responseBody 200 - { "data": { "totalCount": 10, "paidCount": 4, "pendingCount": 3, "overdueCount": 1 } }
   */
  @inject()
  async summary({ bouncer, request, serialize }: HttpContext, invoices: InvoiceService) {
    await bouncer.with(SuperAdminPolicy).authorize('manageBilling')

    const filters = await request.validateUsing(invoiceSummaryValidator, {
      data: request.qs(),
    })

    const summary = await invoices.getInvoiceSummary({
      search: filters.search,
      status: filters.status,
      issueMonth: filters.issueMonth,
      billingPeriod: filters.billingPeriod,
    })

    return serialize(summary)
  }

  /**
   * @summary Platform seller identity for invoice preview (Super Admin)
   * @description Display-ready “From” block from platform_settings. Empty billing fields map to Not configured — never a mock GSTIN. Requires platform:tenants_billing.
   * @tag Super Admin
   * @security BearerAuth
   * @responseBody 200 - { "data": { "brandName": "WhatsAuto", "legalName": "Not configured", "gstin": "" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 403 - { "error": "Permission denied: platform:tenants_billing", "code": "PERMISSION_DENIED" }
   */
  @inject()
  async billingProfile({ bouncer, serialize }: HttpContext, invoices: InvoiceService) {
    await bouncer.with(SuperAdminPolicy).authorize('manageBilling')
    return serialize(await invoices.getBillingProfile())
  }

  /**
   * @summary Create an invoice (Super Admin)
   * @description Generate a manual platform invoice for an organization. Requires platform:tenants_billing.
   * @tag Super Admin
   * @security BearerAuth
   * @requestBody { "organizationId": "uuid", "planName": "Growth", "billingPeriod": "monthly", "lineItems": [{ "description": "Growth Plan", "quantity": 1, "unitPrice": 99, "amount": 99 }] }
   * @responseBody 200 - { "data": { "id": "uuid", "invoiceNumber": "INV-2026-000001", "status": "pending" } }
   */
  @inject()
  async store({ bouncer, request, serialize }: HttpContext, invoices: InvoiceService) {
    await bouncer.with(SuperAdminPolicy).authorize('manageBilling')

    const payload = await request.validateUsing(createSuperAdminInvoiceValidator)
    const invoice = await invoices.createInvoice(payload, request.authUser!.id)
    return serialize(invoice)
  }

  /**
   * @summary Get an invoice by id (Super Admin)
   * @description Invoice detail with line items. Requires platform:tenants_billing.
   * @tag Super Admin
   * @security BearerAuth
   * @paramPath id - Invoice id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "invoiceNumber": "INV-2026-000001" } }
   * @responseBody 404 - { "error": "Invoice Not Found", "code": "E_INVOICE_NOT_FOUND" }
   */
  @inject()
  async show({ bouncer, request, params, serialize }: HttpContext, invoices: InvoiceService) {
    await bouncer.with(SuperAdminPolicy).authorize('manageBilling')

    const { id } = await request.validateUsing(invoiceIdParamValidator, { data: params })
    const invoice = await invoices.getInvoiceById(id)
    return serialize(invoice)
  }

  /**
   * @summary Mark an invoice as paid (Super Admin)
   * @description Manual payment recording for platform invoices. Requires platform:tenants_billing.
   * @tag Super Admin
   * @security BearerAuth
   * @paramPath id - Invoice id - @type(string)
   * @requestBody { "paymentMethod": "Manual", "paymentTransactionId": "uuid" }
   * @responseBody 200 - { "data": { "id": "uuid", "status": "paid" } }
   */
  @inject()
  async markPaid({ bouncer, request, params, serialize }: HttpContext, invoices: InvoiceService) {
    await bouncer.with(SuperAdminPolicy).authorize('manageBilling')

    const { id } = await request.validateUsing(invoiceIdParamValidator, { data: params })
    const payload = await request.validateUsing(markSuperAdminInvoicePaidValidator)
    const invoice = await invoices.markInvoicePaid(id, payload, request.authUser!.id)
    return serialize(invoice)
  }

  /**
   * @summary Regenerate an invoice (Super Admin)
   * @description Creates a new invoice copied from an existing one with a fresh invoice number. Requires platform:tenants_billing.
   * @tag Super Admin
   * @security BearerAuth
   * @paramPath id - Source invoice id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "invoiceNumber": "INV-2026-000002" } }
   */
  @inject()
  async regenerate({ bouncer, request, params, serialize }: HttpContext, invoices: InvoiceService) {
    await bouncer.with(SuperAdminPolicy).authorize('manageBilling')

    const { id } = await request.validateUsing(invoiceIdParamValidator, { data: params })
    const payload = await request.validateUsing(regenerateSuperAdminInvoiceValidator)
    const invoice = await invoices.regenerateInvoice(id, payload, request.authUser!.id)
    return serialize(invoice)
  }

  /**
   * @summary Send an invoice (Super Admin)
   * @description Emails the invoice PDF to the billed-to address. Requires platform:tenants_billing.
   * @tag Super Admin
   * @security BearerAuth
   * @paramPath id - Invoice id - @type(string)
   * @responseBody 200 - { "data": { "ok": true, "invoiceNumber": "INV-2026-000001" } }
   * @responseBody 404 - { "error": "Invoice Not Found", "code": "E_INVOICE_NOT_FOUND" }
   * @responseBody 422 - { "error": "Invoice has no billing email address", "code": "E_INVOICE_RECIPIENT_MISSING" }
   */
  @inject()
  async send({ bouncer, request, params, serialize }: HttpContext, invoices: InvoiceService) {
    await bouncer.with(SuperAdminPolicy).authorize('manageBilling')

    const { id } = await request.validateUsing(invoiceIdParamValidator, { data: params })
    const result = await invoices.sendInvoice(id, request.authUser!.id)
    return serialize(result)
  }

  /**
   * @summary Download an invoice PDF (Super Admin)
   * @description Returns a generated invoice PDF. Requires platform:tenants_billing.
   * @tag Super Admin
   * @security BearerAuth
   * @paramPath id - Invoice id - @type(string)
   * @responseBody 200 - application/pdf
   * @responseBody 404 - { "error": "Invoice Not Found", "code": "E_INVOICE_NOT_FOUND" }
   */
  @inject()
  async download({ bouncer, request, params, response }: HttpContext, invoices: InvoiceService) {
    await bouncer.with(SuperAdminPolicy).authorize('manageBilling')

    const { id } = await request.validateUsing(invoiceIdParamValidator, { data: params })
    const file = await invoices.downloadInvoicePdf(id)
    const safeFilename = file.filename.replaceAll('"', '')

    return response
      .header('Content-Type', file.contentType)
      .header('Content-Disposition', `attachment; filename="${safeFilename}"`)
      .header('Cache-Control', 'no-store')
      .send(file.buffer)
  }
}
