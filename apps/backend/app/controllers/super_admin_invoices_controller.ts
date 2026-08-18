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

    return serialize(result)
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
    const invoice = await invoices.createInvoice(payload)
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
    const invoice = await invoices.markInvoicePaid(id, payload)
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
    const invoice = await invoices.regenerateInvoice(id, payload)
    return serialize(invoice)
  }

  /**
   * @summary Send an invoice (Super Admin)
   * @description Placeholder until email delivery is implemented.
   * @tag Super Admin
   * @security BearerAuth
   * @responseBody 501 - { "error": "Invoice email delivery is not available yet", "code": "E_INVOICE_ACTION_UNAVAILABLE" }
   */
  @inject()
  async send({ bouncer, request, params }: HttpContext, invoices: InvoiceService) {
    await bouncer.with(SuperAdminPolicy).authorize('manageBilling')

    const { id } = await request.validateUsing(invoiceIdParamValidator, { data: params })
    await invoices.getInvoiceById(id)
    invoices.sendInvoiceUnavailable()
  }

  /**
   * @summary Download an invoice PDF (Super Admin)
   * @description Placeholder until PDF generation is implemented.
   * @tag Super Admin
   * @security BearerAuth
   * @responseBody 501 - { "error": "Invoice PDF download is not available yet", "code": "E_INVOICE_ACTION_UNAVAILABLE" }
   */
  @inject()
  async download({ bouncer, request, params }: HttpContext, invoices: InvoiceService) {
    await bouncer.with(SuperAdminPolicy).authorize('manageBilling')

    const { id } = await request.validateUsing(invoiceIdParamValidator, { data: params })
    await invoices.getInvoiceById(id)
    invoices.downloadInvoiceUnavailable()
  }
}
