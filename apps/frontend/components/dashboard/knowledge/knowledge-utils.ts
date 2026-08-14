import type {
  KnowledgeDocument,
  KnowledgeDocumentSourceType,
  KnowledgeDocumentStatus,
  PaginationMeta,
} from '@/lib/api'

export const KNOWLEDGE_UPLOAD_ACCEPT =
  'application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,text/plain,.txt'

export const KNOWLEDGE_MAX_FILE_BYTES = 100 * 1024 * 1024

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const EXT_TO_SOURCE: Record<
  string,
  { sourceType: 'FILE_PDF' | 'FILE_DOCX' | 'FILE_TXT'; mimeType: string }
> = {
  '.pdf': { sourceType: 'FILE_PDF', mimeType: 'application/pdf' },
  '.docx': { sourceType: 'FILE_DOCX', mimeType: DOCX_MIME },
  '.txt': { sourceType: 'FILE_TXT', mimeType: 'text/plain' },
}

export function resolveKnowledgeFileSource(
  file: File
): { sourceType: 'FILE_PDF' | 'FILE_DOCX' | 'FILE_TXT'; mimeType: string } | null {
  const name = file.name.toLowerCase()
  const dot = name.lastIndexOf('.')
  const fromExt = dot >= 0 ? EXT_TO_SOURCE[name.slice(dot)] : null

  if (file.type === 'application/pdf' || fromExt?.sourceType === 'FILE_PDF') {
    return { sourceType: 'FILE_PDF', mimeType: 'application/pdf' }
  }
  if (file.type === DOCX_MIME || fromExt?.sourceType === 'FILE_DOCX') {
    return { sourceType: 'FILE_DOCX', mimeType: DOCX_MIME }
  }
  if (file.type === 'text/plain' || fromExt?.sourceType === 'FILE_TXT') {
    return { sourceType: 'FILE_TXT', mimeType: 'text/plain' }
  }
  return fromExt
}

export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  return base || fileName
}

export function unwrapKnowledgeList(data: unknown): {
  items: KnowledgeDocument[]
  meta: PaginationMeta | null
} {
  if (!data) return { items: [], meta: null }
  if (Array.isArray(data)) return { items: data as KnowledgeDocument[], meta: null }

  const root = data as {
    data?: KnowledgeDocument[] | { data?: KnowledgeDocument[]; meta?: PaginationMeta }
    meta?: PaginationMeta
  }

  if (Array.isArray(root.data)) {
    return { items: root.data, meta: root.meta ?? null }
  }

  if (root.data && typeof root.data === 'object' && Array.isArray(root.data.data)) {
    return {
      items: root.data.data,
      meta: root.data.meta ?? root.meta ?? null,
    }
  }

  return { items: [], meta: null }
}

export function unwrapKnowledgeCreate(data: unknown): {
  document: KnowledgeDocument | null
  upload: {
    url: string
    headers: Record<string, string>
  } | null
} {
  if (!data || typeof data !== 'object') {
    return { document: null, upload: null }
  }

  const root = data as {
    data?: {
      document?: KnowledgeDocument
      upload?: { url?: string; headers?: Record<string, string> }
    }
    document?: KnowledgeDocument
    upload?: { url?: string; headers?: Record<string, string> }
  }

  const payload = root.data?.document ? root.data : root
  const document = payload.document ?? null
  const upload =
    payload.upload?.url != null
      ? { url: payload.upload.url, headers: payload.upload.headers ?? {} }
      : null

  return { document, upload }
}

export function isKnowledgeInFlight(status: string): boolean {
  return status === 'PENDING' || status === 'PROCESSING'
}

export function formatKnowledgeDate(iso: string, locale?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export type StatusFilter = 'all' | KnowledgeDocumentStatus

export const knowledgeQueryKeys = {
  all: ['knowledge-documents'] as const,
  list: (orgId: string | null | undefined, params: Record<string, string | number>) =>
    [...knowledgeQueryKeys.all, 'list', orgId ?? 'none', params] as const,
}

export type KnowledgeSourceLabelKey = KnowledgeDocumentSourceType | string
