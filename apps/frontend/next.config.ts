import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** Server-side rewrite target for `/api/*` when frontend is accessed same-origin. */
const apiRewriteOrigin =
  process.env.API_REWRITE_ORIGIN?.replace(/\/$/, '') ||
  (process.env.NEXT_PUBLIC_API_URL &&
  process.env.NEXT_PUBLIC_API_URL !== process.env.NEXT_PUBLIC_APP_URL
    ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')
    : null) ||
  'http://localhost:3333'

const nextConfig: NextConfig = {
  /** Self-contained Node server for Docker / Contabo (not Vercel serverless). */
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiRewriteOrigin}/api/:path*`,
      },
      {
        source: '/media/:path*',
        destination: `${apiRewriteOrigin}/media/:path*`,
      },
    ]
  },
}

export default withNextIntl(nextConfig)
