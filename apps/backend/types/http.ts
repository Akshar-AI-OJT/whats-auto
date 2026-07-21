import type { auth } from '#lib/auth'
import type { Permission } from '#abilities/permissions'
import type { ActiveMember } from '#services/authorization_service'

export type AuthUser = typeof auth.$Infer.Session.user

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
    activeOrganizationId?: string // set by jwtAuth — from session
    activeMember?: ActiveMember // set by tenant middleware
    memberPermissions?: Set<Permission> // set by tenant middleware — cached for this request
  }
}
