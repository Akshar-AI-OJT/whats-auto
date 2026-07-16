import createMiddleware from 'next-intl/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)
const PROTECTED = ['/dashboard']

function hasSessionCookie(request: NextRequest) {
  return (
    request.cookies.has('better-auth.session_token') ||
    request.cookies.has('__Secure-better-auth.session_token')
  )
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const withoutLocale = pathname.replace(/^\/(en|hi)/, '') || '/'
  const locale = pathname.match(/^\/(en|hi)(?=\/|$)/)?.[1] ?? routing.defaultLocale

  if (PROTECTED.some((route) => withoutLocale === route || withoutLocale.startsWith(`${route}/`))) {
    if (!hasSessionCookie(request)) {
      const loginUrl = new URL(`/${locale}/login`, request.url)
      loginUrl.searchParams.set('callbackURL', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
