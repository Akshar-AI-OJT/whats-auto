import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** Server-side rewrite target for `/api/*` (browser stays same-origin). */
const apiRewriteOrigin =
  process.env.API_REWRITE_ORIGIN?.replace(/\/$/, '') || 'http://localhost:3333'

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiRewriteOrigin}/api/:path*`,
      },
    ]
  },
}

export default withNextIntl(nextConfig)
