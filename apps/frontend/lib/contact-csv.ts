/** Frontend-only CSV parsing for the import mapping UI. Phone normalization stays on the backend. */

export const CONTACT_CSV_FIELDS = ['phone', 'name', 'email', 'company'] as const
export type ContactCsvField = (typeof CONTACT_CSV_FIELDS)[number]
export type ContactCsvColumnMapping = Partial<Record<ContactCsvField, string>>

export const CONTACT_CSV_MAX_ROWS = 5000
export const CONTACT_CSV_MAX_BYTES = 2 * 1024 * 1024

export type ContactCsvParseCode = 'empty' | 'malformed' | 'noHeaders' | 'tooManyRows'

export class ContactCsvParseError extends Error {
  readonly code: ContactCsvParseCode

  constructor(code: ContactCsvParseCode) {
    super(code)
    this.name = 'ContactCsvParseError'
    this.code = code
  }
}

export type ParsedContactCsv = {
  headers: string[]
  rows: Record<string, string>[]
  totalRows: number
}

const FIELD_ALIASES: Record<ContactCsvField, readonly string[]> = {
  phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'cell', 'cellphone', 'whatsapp'],
  name: ['name', 'fullname', 'contactname'],
  email: ['email', 'emailaddress', 'mail'],
  company: ['company', 'companyname', 'organisation', 'organization', 'org'],
}

function normalizeHeaderKey(value: string) {
  return value.toLowerCase().replace(/[\s_\-/]+/g, '')
}

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const pushCell = () => {
    row.push(cell)
    cell = ''
  }

  const pushRow = () => {
    if (row.some((value) => value.trim() !== '')) {
      records.push(row)
    }
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          cell += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }

    if (ch === ',') {
      pushCell()
      continue
    }

    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i += 1
      pushCell()
      pushRow()
      continue
    }

    cell += ch
  }

  if (inQuotes) {
    throw new ContactCsvParseError('malformed')
  }

  if (cell.length > 0 || row.length > 0) {
    pushCell()
    pushRow()
  }

  return records
}

export function parseContactCsvText(content: string): ParsedContactCsv {
  const trimmed = content.replace(/^\uFEFF/, '')
  if (!trimmed.trim()) {
    throw new ContactCsvParseError('empty')
  }

  let records: string[][]
  try {
    records = parseCsvRecords(trimmed)
  } catch (error) {
    if (error instanceof ContactCsvParseError) throw error
    throw new ContactCsvParseError('malformed')
  }

  if (records.length === 0) {
    throw new ContactCsvParseError('empty')
  }

  const headerCells = records[0] ?? []
  const headers = headerCells.map((header, index) => header.trim() || `Column ${index + 1}`)
  if (headers.every((header) => /^Column \d+$/.test(header))) {
    throw new ContactCsvParseError('noHeaders')
  }

  const dataRecords = records.slice(1)
  if (dataRecords.length === 0) {
    throw new ContactCsvParseError('empty')
  }
  if (dataRecords.length > CONTACT_CSV_MAX_ROWS) {
    throw new ContactCsvParseError('tooManyRows')
  }

  const rows = dataRecords.map((record) => {
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = (record[index] ?? '').trim()
    })
    return row
  })

  return { headers, rows, totalRows: rows.length }
}

export function suggestContactField(header: string): ContactCsvField | '' {
  const key = normalizeHeaderKey(header)
  for (const field of CONTACT_CSV_FIELDS) {
    if (FIELD_ALIASES[field].includes(key)) return field
  }
  return ''
}

export function suggestColumnMapping(headers: string[]): Record<string, ContactCsvField | ''> {
  const used = new Set<ContactCsvField>()
  const mapping: Record<string, ContactCsvField | ''> = {}

  for (const header of headers) {
    const suggested = suggestContactField(header)
    if (suggested && !used.has(suggested)) {
      mapping[header] = suggested
      used.add(suggested)
    } else {
      mapping[header] = ''
    }
  }

  return mapping
}

export function toBackendColumnMapping(
  csvToField: Record<string, ContactCsvField | ''>
): ContactCsvColumnMapping {
  const mapping: ContactCsvColumnMapping = {}
  for (const [header, field] of Object.entries(csvToField)) {
    if (field) mapping[field] = header
  }
  return mapping
}

export function mappedFieldsList(
  csvToField: Record<string, ContactCsvField | ''>
): ContactCsvField[] {
  const fields: ContactCsvField[] = []
  for (const field of CONTACT_CSV_FIELDS) {
    if (Object.values(csvToField).includes(field)) fields.push(field)
  }
  return fields
}

export function hasDuplicateFieldMapping(csvToField: Record<string, ContactCsvField | ''>) {
  const seen = new Set<ContactCsvField>()
  for (const field of Object.values(csvToField)) {
    if (!field) continue
    if (seen.has(field)) return true
    seen.add(field)
  }
  return false
}

export function isCsvFile(file: File) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) return true
  return file.type === 'text/csv' || file.type === 'application/vnd.ms-excel'
}

export function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
