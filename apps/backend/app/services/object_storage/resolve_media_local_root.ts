import path from 'node:path'

/**
 * Resolve MEDIA_LOCAL_ROOT so API and worker always share the same directory.
 *
 * Relative values must be anchored to the Adonis app root — not process.cwd().
 * Locally, HTTP and the BullMQ worker are often started from different folders;
 * path.resolve('./media') then points at different trees and ingest fails with
 * "Knowledge file is missing from storage" even though the upload succeeded.
 */
export function resolveMediaLocalRoot(
  configured: string | undefined,
  appRootAbsolute: string
): string {
  const root = appRootAbsolute
  if (!configured || configured.trim() === '') {
    return path.resolve(root, 'media')
  }
  if (path.isAbsolute(configured)) {
    return path.normalize(configured)
  }
  return path.resolve(root, configured)
}
