import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '#lib/auth'
import '#types/http'

export default class JwtAuthMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers()),
    })

    if (!session?.user) {
      return response.unauthorized({ error: 'Missing or invalid session' })
    }

    request.authUser = session.user
    // activeOrganizationId is stored in the session by Better Auth's org plugin
    request.activeOrganizationId = (session.session as any).activeOrganizationId ?? undefined
    return next()
  }
}
