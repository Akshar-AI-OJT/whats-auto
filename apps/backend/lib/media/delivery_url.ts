/**
 * Builds the public CDN/CloudFront URL WhatsApp fetches via `link`.
 * `MEDIA_PUBLIC_BASE_URL` must have no trailing slash.
 */
export function buildMediaDeliveryUrl(publicBaseUrl: string, storageKey: string): string {
  const base = publicBaseUrl.replace(/\/+$/, '')
  const key = storageKey.replace(/^\/+/, '')
  return `${base}/${key}`
}
