import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import ContactException from '#exceptions/contact_exception'
import {
  iterateContactCsvRows,
  mappedCell,
  parseContactCsv,
  resolvePhoneHeader,
  type ContactCsvColumnMapping,
} from '#lib/contact_csv'
import {
  isInternationalContactPhone,
  normalizeContactPhone,
  normalizeIsoCountryCode,
} from '#lib/contact_phone'
import { sanitizeContactImportFileName } from '#lib/organization_storage_path'
import { PlanEnforcementService } from '#services/billing/plan_enforcement_service'
import { enqueueContactImport } from '#services/contact_import_queue'
import { ContactService } from '#services/contact_service'
import { ContactImportStorage } from '#services/contact_import_storage'
import { runWithTenant } from '#services/tenant_context'
import { validateContactProfileFields } from '#validators/contact'

const IMPORT_COLUMNS = [
  'id',
  'organizationId',
  'createdByUserId',
  'fileName',
  'status',
  'columnMapping',
  'defaultCountryCode',
  'processedRows',
  'totalRows',
  'successCount',
  'errorCount',
  'createdAt',
  'updatedAt',
  'completedAt',
] as const

const TERMINAL_IMPORT_STATUSES = new Set(['completed', 'stopped_due_to_limit'])

export type ContactImportRowResult = {
  rowNumber: number
  status: 'processed' | 'failed' | 'skipped'
  action: 'inserted' | 'skipped' | null
  errorMessage: string | null
  contactId: string | null
  rawData: Record<string, string>
}

export type ContactImportResult = {
  id: string
  organizationId: string
  fileName: string
  status: string
  defaultCountryCode: string | null
  columnMapping: ContactCsvColumnMapping
  totalRows: number
  processedRows: number
  successCount: number
  errorCount: number
  completedAt: string | null
  rows: ContactImportRowResult[]
}

function rowErrorMessage(phoneNumber: string, defaultCountryCode: string | undefined): string {
  if (!phoneNumber) {
    return 'Missing phone value'
  }
  if (!isInternationalContactPhone(phoneNumber) && !defaultCountryCode) {
    return 'National phone number requires a default country'
  }
  return 'Invalid phone number'
}

function asColumnMapping(value: unknown): ContactCsvColumnMapping {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return { ...(value as ContactCsvColumnMapping) }
}

function asRawData(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const raw: Record<string, string> = {}
  for (const [key, cell] of Object.entries(value as Record<string, unknown>)) {
    raw[key] = cell === null || cell === undefined ? '' : String(cell)
  }
  return raw
}

function toIso(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toISOString()
  }
  return null
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: string }).code
    if (code === '23505') return true
    current = (current as { cause?: unknown }).cause ?? (current as { original?: unknown }).original
  }
  return false
}

export class ContactImportService {
  constructor(
    private contacts: ContactService = new ContactService(),
    private storage: ContactImportStorage = new ContactImportStorage()
  ) {}

  /**
   * Validate the CSV, store it under the organization imports/contacts path,
   * persist a contact_imports row, enqueue a worker job, and return immediately.
   * Contact rows are created by processImport from the stored file.
   */
  async importCsv(params: {
    organizationId: string
    actorUserId: string
    fileName: string
    csvContent: string
    columnMapping?: ContactCsvColumnMapping
    defaultCountryCode?: string
  }): Promise<ContactImportResult> {
    let defaultCountryCode: string | undefined
    try {
      defaultCountryCode = normalizeIsoCountryCode(params.defaultCountryCode)
    } catch {
      throw ContactException.importInvalidCountry()
    }

    const mapping: ContactCsvColumnMapping = { ...params.columnMapping }
    const parsed = parseContactCsv(params.csvContent)
    resolvePhoneHeader(parsed.headers, mapping)

    await new PlanEnforcementService().requireFeature(
      params.organizationId,
      'contactCsvImportExport'
    )

    const importId = randomUUID()
    const fileName = sanitizeContactImportFileName(params.fileName.trim() || 'contacts.csv')
    const filePath = await this.storage.allocateContactImportKey(
      params.organizationId,
      fileName,
      importId
    )
    await this.storage.putText(filePath, params.csvContent)

    const [importRow] = await db
      .table('contact_imports')
      .insert({
        id: importId,
        organizationId: params.organizationId,
        createdByUserId: params.actorUserId,
        fileName,
        status: 'pending',
        columnMapping: mapping,
        defaultCountryCode: defaultCountryCode ?? null,
        filePath,
        csvContent: null,
        totalRows: parsed.rows.length,
        processedRows: 0,
        successCount: 0,
        errorCount: 0,
      })
      .returning([...IMPORT_COLUMNS])

    try {
      await enqueueContactImport({
        organizationId: params.organizationId,
        importId,
      })
    } catch (error) {
      await db.from('contact_imports').where('id', importId).update({
        status: 'failed',
        completedAt: new Date(),
      })
      throw error
    }

    return this.#toResult(importRow, {
      status: 'pending',
      defaultCountryCode: defaultCountryCode ?? null,
      columnMapping: mapping,
      totalRows: parsed.rows.length,
      processedRows: 0,
      successCount: 0,
      errorCount: 0,
      completedAt: null,
      rows: [],
    })
  }

  /**
   * Worker entry: stream CSV rows, create contacts one by one, and stop as soon
   * as the current plan contact limit is reached.
   */
  async processImport(params: {
    organizationId: string
    importId: string
  }): Promise<ContactImportResult> {
    return runWithTenant(params.organizationId, async () => {
      const importRow = await db
        .from('contact_imports')
        .where('id', params.importId)
        .where('organizationId', params.organizationId)
        .select([...IMPORT_COLUMNS, 'filePath', 'csvContent'])
        .first()

      if (!importRow) {
        throw ContactException.importNotFound()
      }

      if (TERMINAL_IMPORT_STATUSES.has(importRow.status as string)) {
        return this.getImport(params)
      }

      let csvContent = ''
      try {
        csvContent = await this.#loadStoredCsv({
          organizationId: params.organizationId,
          filePath: typeof importRow.filePath === 'string' ? importRow.filePath : null,
          csvContent: typeof importRow.csvContent === 'string' ? importRow.csvContent : null,
        })
      } catch (error) {
        await db.from('contact_imports').where('id', params.importId).update({
          status: 'failed',
          completedAt: new Date(),
        })
        throw error
      }

      await db.from('contact_imports').where('id', params.importId).update({
        status: 'processing',
      })

      const mapping = asColumnMapping(importRow.columnMapping)
      const defaultCountryCode =
        typeof importRow.defaultCountryCode === 'string' && importRow.defaultCountryCode
          ? importRow.defaultCountryCode
          : undefined
      const actorUserId = (importRow.createdByUserId as string | null) ?? ''

      const existingRows = await db
        .from('contact_import_rows')
        .where('importId', params.importId)
        .select('rowNumber', 'status', 'action', 'contactId', 'rawData')

      const processedRowNumbers = new Set<number>(existingRows.map((row) => Number(row.rowNumber)))
      const seenNormalized = new Set<string>()
      await this.#hydrateSeenPhones({
        organizationId: params.organizationId,
        existingRows,
        mapping,
        defaultCountryCode,
        seenNormalized,
      })

      let successCount = Number(importRow.successCount ?? 0)
      let errorCount = Number(importRow.errorCount ?? 0)
      let processedRows = Number(importRow.processedRows ?? 0)
      let stoppedDueToLimit = false
      let index = 0

      try {
        for await (const rawData of iterateContactCsvRows(csvContent)) {
          const rowNumber = index + 2
          index += 1
          if (processedRowNumbers.has(rowNumber)) {
            continue
          }

          const headers = Object.keys(rawData)
          try {
            const result = await this.#processRow({
              organizationId: params.organizationId,
              actorUserId,
              importId: params.importId,
              rowNumber,
              rawData,
              headers,
              mapping,
              defaultCountryCode,
              seenNormalized,
            })
            processedRows += 1
            if (result.status === 'failed') errorCount += 1
            if (result.status === 'processed' && result.action === 'inserted') successCount += 1
            await this.#updateProgress(params.importId, {
              processedRows,
              successCount,
              errorCount,
            })
          } catch (error) {
            if (
              error instanceof ContactException &&
              error.code === 'E_CONTACT_PLAN_LIMIT_REACHED'
            ) {
              await this.#recordLimitStopRow({
                organizationId: params.organizationId,
                importId: params.importId,
                rowNumber,
                rawData,
                errorMessage: error.message,
              })
              processedRows += 1
              stoppedDueToLimit = true
              await this.#updateProgress(params.importId, {
                processedRows,
                successCount,
                errorCount,
              })
              break
            }
            throw error
          }
        }

        const completedAt = new Date()
        const status = stoppedDueToLimit ? 'stopped_due_to_limit' : 'completed'
        await db.from('contact_imports').where('id', params.importId).update({
          status,
          processedRows,
          successCount,
          errorCount,
          completedAt,
        })
      } catch (error) {
        await db.from('contact_imports').where('id', params.importId).update({
          status: 'failed',
          processedRows,
          successCount,
          errorCount,
          completedAt: new Date(),
        })
        throw error
      }

      return this.getImport(params)
    })
  }

  async getImport(params: {
    organizationId: string
    importId: string
  }): Promise<ContactImportResult> {
    const load = async () => {
      const importRow = await db
        .from('contact_imports')
        .where('id', params.importId)
        .where('organizationId', params.organizationId)
        .select([...IMPORT_COLUMNS])
        .first()

      if (!importRow) {
        throw ContactException.importNotFound()
      }

      const dbRows = await db
        .from('contact_import_rows')
        .where('importId', params.importId)
        .orderBy('rowNumber')

      return this.#toResult(importRow, {
        status: importRow.status as string,
        defaultCountryCode: (importRow.defaultCountryCode as string | null) ?? null,
        columnMapping: asColumnMapping(importRow.columnMapping),
        totalRows: Number(importRow.totalRows ?? 0),
        processedRows: Number(importRow.processedRows ?? 0),
        successCount: Number(importRow.successCount ?? 0),
        errorCount: Number(importRow.errorCount ?? 0),
        completedAt: toIso(importRow.completedAt),
        rows: dbRows.map((row) => ({
          rowNumber: Number(row.rowNumber),
          status: row.status as ContactImportRowResult['status'],
          action: (row.action as ContactImportRowResult['action']) ?? null,
          errorMessage: (row.errorMessage as string | null) ?? null,
          contactId: (row.contactId as string | null) ?? null,
          rawData: asRawData(row.rawData),
        })),
      })
    }

    return runWithTenant(params.organizationId, load)
  }

  async #loadStoredCsv(params: {
    organizationId: string
    filePath: string | null
    csvContent: string | null
  }): Promise<string> {
    if (params.filePath) {
      return this.storage.getContactImportCsv(params.organizationId, params.filePath)
    }

    if (params.csvContent) {
      return params.csvContent
    }

    throw new Error('Contact import is missing CSV content')
  }

  async #hydrateSeenPhones(params: {
    organizationId: string
    existingRows: Array<{
      contactId?: string | null
      rawData?: unknown
      status?: string
      action?: string | null
    }>
    mapping: ContactCsvColumnMapping
    defaultCountryCode: string | undefined
    seenNormalized: Set<string>
  }): Promise<void> {
    const contactIds = params.existingRows
      .map((row) => row.contactId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)

    if (contactIds.length > 0) {
      const contacts = await db
        .from('contacts')
        .where('organizationId', params.organizationId)
        .whereIn('id', contactIds)
        .select('phoneNormalized')
      for (const contact of contacts) {
        if (typeof contact.phoneNormalized === 'string' && contact.phoneNormalized) {
          params.seenNormalized.add(contact.phoneNormalized)
        }
      }
    }

    for (const row of params.existingRows) {
      if (row.status !== 'skipped' && row.action !== 'skipped') continue
      const rawData = asRawData(row.rawData)
      const phoneNumber = mappedCell(rawData, Object.keys(rawData), params.mapping, 'phone')
      if (!phoneNumber) continue
      try {
        params.seenNormalized.add(
          normalizeContactPhone(
            phoneNumber,
            isInternationalContactPhone(phoneNumber) ? undefined : params.defaultCountryCode
          )
        )
      } catch {
        // skip tracking if re-parse fails
      }
    }
  }

  async #updateProgress(
    importId: string,
    counts: { processedRows: number; successCount: number; errorCount: number }
  ): Promise<void> {
    await db.from('contact_imports').where('id', importId).update(counts)
  }

  async #recordLimitStopRow(params: {
    organizationId: string
    importId: string
    rowNumber: number
    rawData: Record<string, string>
    errorMessage: string
  }): Promise<void> {
    try {
      await db.table('contact_import_rows').insert({
        organizationId: params.organizationId,
        importId: params.importId,
        contactId: null,
        rowNumber: params.rowNumber,
        rawData: params.rawData,
        status: 'skipped',
        action: 'skipped',
        errorMessage: params.errorMessage,
      })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
    }
  }

  async #processRow(params: {
    organizationId: string
    actorUserId: string
    importId: string
    rowNumber: number
    rawData: Record<string, string>
    headers: string[]
    mapping: ContactCsvColumnMapping
    defaultCountryCode: string | undefined
    seenNormalized: Set<string>
  }): Promise<ContactImportRowResult> {
    const phoneNumber = mappedCell(params.rawData, params.headers, params.mapping, 'phone')
    const name = mappedCell(params.rawData, params.headers, params.mapping, 'name') || undefined
    const email = mappedCell(params.rawData, params.headers, params.mapping, 'email') || undefined
    const company =
      mappedCell(params.rawData, params.headers, params.mapping, 'company') || undefined

    let status: ContactImportRowResult['status'] = 'failed'
    let action: ContactImportRowResult['action'] = null
    let errorMessage: string | null = rowErrorMessage(phoneNumber, params.defaultCountryCode)
    let contactId: string | null = null

    if (phoneNumber && (isInternationalContactPhone(phoneNumber) || params.defaultCountryCode)) {
      try {
        const phoneNormalized = normalizeContactPhone(phoneNumber, params.defaultCountryCode)
        if (params.seenNormalized.has(phoneNormalized)) {
          status = 'skipped'
          action = 'skipped'
          errorMessage = 'A contact with this phone number already exists'
        } else {
          const profile = await validateContactProfileFields({ name, email, company })
          if (!profile.ok) {
            errorMessage = profile.message
          } else {
            const created = await this.contacts.createContact({
              organizationId: params.organizationId,
              actorUserId: params.actorUserId,
              phoneNumber,
              countryCode: isInternationalContactPhone(phoneNumber)
                ? undefined
                : params.defaultCountryCode,
              name: profile.value.name,
              email: profile.value.email,
              company: profile.value.company,
            })
            params.seenNormalized.add(created.phoneNormalized)
            status = 'processed'
            action = 'inserted'
            errorMessage = null
            contactId = created.id
          }
        }
      } catch (error) {
        if (error instanceof ContactException && error.code === 'E_CONTACT_PHONE_EXISTS') {
          status = 'skipped'
          action = 'skipped'
          errorMessage = 'A contact with this phone number already exists'
          try {
            params.seenNormalized.add(
              normalizeContactPhone(
                phoneNumber,
                isInternationalContactPhone(phoneNumber) ? undefined : params.defaultCountryCode
              )
            )
          } catch {
            // uniqueness was on the stored contact; skip tracking if re-parse fails
          }
        } else if (error instanceof ContactException && error.code === 'E_CONTACT_PHONE_INVALID') {
          errorMessage = 'Invalid phone number'
        } else {
          throw error
        }
      }
    }

    try {
      await db.table('contact_import_rows').insert({
        organizationId: params.organizationId,
        importId: params.importId,
        contactId,
        rowNumber: params.rowNumber,
        rawData: params.rawData,
        status,
        action,
        errorMessage,
      })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
    }

    return {
      rowNumber: params.rowNumber,
      status,
      action,
      errorMessage,
      contactId,
      rawData: params.rawData,
    }
  }

  #toResult(
    importRow: Record<string, unknown>,
    extras: {
      status: string
      defaultCountryCode: string | null
      columnMapping: ContactCsvColumnMapping
      totalRows: number
      processedRows: number
      successCount: number
      errorCount: number
      completedAt: string | null
      rows: ContactImportRowResult[]
    }
  ): ContactImportResult {
    return {
      id: importRow.id as string,
      organizationId: importRow.organizationId as string,
      fileName: importRow.fileName as string,
      status: extras.status,
      defaultCountryCode: extras.defaultCountryCode,
      columnMapping: extras.columnMapping,
      totalRows: extras.totalRows,
      processedRows: extras.processedRows,
      successCount: extras.successCount,
      errorCount: extras.errorCount,
      completedAt: extras.completedAt,
      rows: extras.rows,
    }
  }
}

export type { ContactCsvColumnMapping }
