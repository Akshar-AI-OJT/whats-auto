import type { auth } from '#lib/auth'
import type { Permission } from '#abilities/permissions'
import type { ActiveMember } from '#services/authorization_service'
import type { AccessTokenClaims } from '#types/access_token'

export type AuthUser = typeof auth.$Infer.Session.user

export type AuthMethod = 'bearer' | 'session'

/**
 * Principal passed to Bouncer policies. Built lazily at authorize-time so
 * jwtAuth + tenant have already populated request fields.
 */
export type AuthzPrincipal = AuthUser & {
  activeMember?: ActiveMember
  memberPermissions?: Set<Permission>
}

declare module '@adonisjs/core/http' {
  interface HttpRequest {
    authUser?: AuthUser
    sessionId?: string // Better Auth session id (from JWT sid or cookie session)
    activeOrganizationId?: string // from JWT org_id or sessions.activeOrganizationId
    activeMember?: ActiveMember // set by tenant middleware
    memberPermissions?: Set<Permission> // set by tenant/platform middleware
    accessTokenClaims?: AccessTokenClaims // set when authMethod === 'bearer'
    authMethod?: AuthMethod // 'bearer' | 'session'
  }
}
