import db from '@adonisjs/lucid/services/db'
import ContactException from '#exceptions/contact_exception'
import {
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
import { ContactService } from '#services/contact_service'
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

export class ContactImportService {
  constructor(private contacts: ContactService = new ContactService()) {}

  /**
   * Parse a CSV, persist contact_imports / contact_import_rows, and create contacts.
   * Runs in-request so it can later be moved to a job without changing row semantics.
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

    const [importRow] = await db
      .table('contact_imports')
      .insert({
        organizationId: params.organizationId,
        createdByUserId: params.actorUserId,
        fileName: params.fileName.trim() || 'contacts.csv',
        status: 'processing',
        columnMapping: mapping,
        defaultCountryCode: defaultCountryCode ?? null,
        totalRows: parsed.rows.length,
        processedRows: 0,
        successCount: 0,
        errorCount: 0,
      })
      .returning([...IMPORT_COLUMNS])

    const importId = importRow.id as string
    const seenNormalized = new Set<string>()
    const results: ContactImportRowResult[] = []
    let successCount = 0
    let errorCount = 0

    try {
      for (let index = 0; index < parsed.rows.length; index++) {
        const rawData = parsed.rows[index] ?? {}
        const rowNumber = index + 2
        const result = await this.#processRow({
          organizationId: params.organizationId,
          actorUserId: params.actorUserId,
          importId,
          rowNumber,
          rawData,
          headers: parsed.headers,
          mapping,
          defaultCountryCode,
          seenNormalized,
        })
        results.push(result)
        if (result.status === 'failed') errorCount += 1
        if (result.status === 'processed' && result.action === 'inserted') successCount += 1
      }

      const completedAt = new Date()
      await db.from('contact_imports').where('id', importId).update({
        status: 'completed',
        processedRows: results.length,
        successCount,
        errorCount,
        completedAt,
      })

      return this.#toResult(importRow, {
        status: 'completed',
        defaultCountryCode: defaultCountryCode ?? null,
        columnMapping: mapping,
        totalRows: parsed.rows.length,
        processedRows: results.length,
        successCount,
        errorCount,
        completedAt: completedAt.toISOString(),
        rows: results,
      })
    } catch (error) {
      await db.from('contact_imports').where('id', importId).update({
        status: 'failed',
        processedRows: results.length,
        successCount,
        errorCount,
        completedAt: new Date(),
      })
      throw error
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
