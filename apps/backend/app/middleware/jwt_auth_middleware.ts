import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { fromNodeHeaders } from 'better-auth/node'
import db from '@adonisjs/lucid/services/db'
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
    request.sessionId = session.session.id

    const sessionRow = await db
      .from('sessions')
      .where('id', session.session.id)
      .select('activeOrganizationId')
      .first()

    request.activeOrganizationId = sessionRow?.activeOrganizationId ?? undefined
    return next()
  }
}
