import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** Local-only rewrite so `next dev` can keep same-origin `/api/*`. */
const apiRewriteOrigin =
  process.env.API_REWRITE_ORIGIN?.replace(/\/$/, '') || 'http://localhost:3333'

const nextConfig: NextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/:path*',
          destination: `${apiRewriteOrigin}/api/:path*`,
        },
      ]
    }
    return []
  },
}

export default withNextIntl(nextConfig)
