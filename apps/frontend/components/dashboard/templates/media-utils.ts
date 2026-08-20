import type { MediaAsset, MediaQuota, PaginationMeta } from '@/lib/api'

/** MIME types accepted by Media Library upload (matches backend outbound allowlist). */
export const MEDIA_UPLOAD_ACCEPT =
  'image/jpeg,image/png,image/jpg,.jpg,.jpeg,.png,application/pdf,.pdf,text/csv,application/csv,.csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,application/msword,.doc,application/vnd.ms-excel,.xls,text/plain,.txt'

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export function resolveUploadMimeType(file: File): string | null {
  if (file.type) {
    if (file.type === 'image/jpg') return 'image/jpeg'
    return file.type
  }
  const name = file.name.toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot < 0) return null
  return EXT_TO_MIME[name.slice(dot)] ?? null
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function unwrapMediaList(data: unknown): {
  items: MediaAsset[]
  meta: PaginationMeta | null
} {
  if (!data) return { items: [], meta: null }
  if (Array.isArray(data)) return { items: data as MediaAsset[], meta: null }

  const root = data as {
    data?: MediaAsset[] | { data?: MediaAsset[]; meta?: PaginationMeta }
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

/** API returns `{ data: MediaQuota }`; protectedRequest keeps the outer JSON. */
export function unwrapMediaQuota(data: unknown): MediaQuota | null {
  if (!data || typeof data !== 'object') return null

  const root = data as { data?: MediaQuota } & Partial<MediaQuota>
  const nested = root.data
  const quota =
    nested &&
    typeof nested === 'object' &&
    (nested.usedBytes != null || nested.limitBytes != null)
      ? nested
      : root

  if (quota.usedBytes == null && quota.limitBytes == null) return null

  return {
    readyBytes: Number(quota.readyBytes ?? 0),
    reservedBytes: Number(quota.reservedBytes ?? 0),
    usedBytes: Number(quota.usedBytes ?? 0),
    limitBytes: Number(quota.limitBytes ?? 0),
  }
}
