import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { fromNodeHeaders } from 'better-auth/node'
import db from '@adonisjs/lucid/services/db'
import { auth } from '#lib/auth'
import {
  AccessTokenVerificationError,
  extractBearerToken,
  verifyAccessToken,
} from '#lib/access_token_verifier'
import type { AccessTokenClaims } from '#types/access_token'
import type { AuthUser } from '#types/http'
import '#types/http'

export type JwtAuthOptions = {
  /** When true, cookie session auth is rejected — Bearer required. */
  bearerOnly?: boolean
}

/**
 * Hybrid auth middleware (registered as jwtAuth).
 *
 * - Bearer present → verify JWT; invalid Bearer never falls back to cookie
 * - No Bearer → Better Auth cookie session (unless bearerOnly)
 */
export default class JwtAuthMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn, options: JwtAuthOptions = {}) {
    const bearer = extractBearerToken(request.header('authorization'))

    if (bearer) {
      try {
        const claims = await verifyAccessToken(bearer)
        this.hydrateFromClaims(request, claims)
        return next()
      } catch (error) {
        const code = error instanceof AccessTokenVerificationError ? error.code : 'INVALID_TOKEN'
        return response.unauthorized({
          error: 'Missing or invalid access token',
          code,
        })
      }
    }

    if (options.bearerOnly) {
      return response.unauthorized({
        error: 'Bearer token required',
        code: 'BEARER_REQUIRED',
      })
    }

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers()),
    })

    if (!session?.user) {
      return response.unauthorized({ error: 'Missing or invalid session' })
    }

    request.authMethod = 'session'
    request.authUser = session.user
    request.sessionId = session.session.id
    request.accessTokenClaims = undefined

    const sessionRow = await db
      .from('sessions')
      .where('id', session.session.id)
      .select('activeOrganizationId')
      .first()

    request.activeOrganizationId =
      sessionRow?.activeOrganizationId ??
      (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ??
      undefined

    return next()
  }

  private hydrateFromClaims(request: HttpContext['request'], claims: AccessTokenClaims): void {
    request.authMethod = 'bearer'
    request.accessTokenClaims = claims
    request.sessionId = claims.sid
    request.activeOrganizationId = claims.org_id
    request.authUser = {
      id: claims.sub,
      email: claims.email,
      name: claims.name,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
      firstname: '',
      lastname: '',
      isActive: true,
      isDeleted: false,
    } as AuthUser
  }
}
