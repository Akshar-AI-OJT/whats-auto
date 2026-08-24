import { parse } from 'csv-parse/sync'
import ContactException from '#exceptions/contact_exception'

export const CONTACT_CSV_FIELDS = ['phone', 'name', 'email', 'company'] as const
export type ContactCsvField = (typeof CONTACT_CSV_FIELDS)[number]
export type ContactCsvColumnMapping = Partial<Record<ContactCsvField, string>>

export const CONTACT_CSV_MAX_ROWS = 5000

export type ParsedContactCsv = {
  headers: string[]
  rows: Record<string, string>[]
}

function asRow(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const row: Record<string, string> = {}
  for (const [key, cell] of Object.entries(value as Record<string, unknown>)) {
    row[key] = cell === null || cell === undefined ? '' : String(cell)
  }
  return row
}

function findHeader(headers: string[], wanted: string): string | undefined {
  const target = wanted.trim().toLowerCase()
  if (!target) return undefined
  return headers.find((header) => header.trim().toLowerCase() === target)
}

export function parseContactCsv(content: string): ParsedContactCsv {
  const trimmed = content.replace(/^\uFEFF/, '').trim()
  if (!trimmed) {
    throw ContactException.importEmpty()
  }

  let records: unknown[]
  try {
    records = parse(trimmed, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    }) as unknown[]
  } catch {
    throw ContactException.importMalformed()
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw ContactException.importEmpty()
  }

  if (records.length > CONTACT_CSV_MAX_ROWS) {
    throw ContactException.importTooManyRows()
  }

  const rows = records.map(asRow)
  const headers = Object.keys(rows[0] ?? {})
  if (headers.length === 0) {
    throw ContactException.importMalformed()
  }

  return { headers, rows }
}

export function resolvePhoneHeader(headers: string[], mapping: ContactCsvColumnMapping): string {
  const mapped = mapping.phone?.trim()
  if (mapped) {
    const match = findHeader(headers, mapped)
    if (!match) {
      throw ContactException.importMissingPhoneColumn()
    }
    return match
  }

  const fallback = findHeader(headers, 'phone') ?? findHeader(headers, 'phoneNumber')
  if (!fallback) {
    throw ContactException.importMissingPhoneColumn()
  }
  return fallback
}

export function mappedCell(
  row: Record<string, string>,
  headers: string[],
  mapping: ContactCsvColumnMapping,
  field: ContactCsvField
): string {
  const wanted = mapping[field]?.trim()
  if (!wanted) {
    if (field === 'phone') {
      const header = findHeader(headers, 'phone') ?? findHeader(headers, 'phoneNumber')
      return header ? (row[header] ?? '').trim() : ''
    }
    const header = findHeader(headers, field)
    return header ? (row[header] ?? '').trim() : ''
  }

  const header = findHeader(headers, wanted)
  return header ? (row[header] ?? '').trim() : ''
}
