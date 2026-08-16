import { BasePolicy, AuthorizationResponse } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export default class OrganizationPolicy extends BasePolicy {
  /** Owner can perform any action on their active organization */
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  /** Update org profile/settings — requires org:settings_manage and active org match */
  update(user: AuthzPrincipal, organizationId: string): boolean | AuthorizationResponse {
    if (organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny(
        'Organization id does not match the active organization. Call set-active first.',
        403
      )
    }
    return user.memberPermissions?.has('org:settings_manage') ?? false
  }

  /** Delete organization — STRICTLY OWNER ONLY */
  delete(user: AuthzPrincipal, organizationId: string): boolean | AuthorizationResponse {
    if (organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny(
        'Organization id does not match the active organization. Call set-active first.',
        403
      )
    }
    if (user.activeMember?.role !== 'owner') {
      return AuthorizationResponse.deny(
        'Only the organization owner can delete the organization.',
        403
      )
    }
    return user.memberPermissions?.has('org:delete') ?? false
  }

  /** Switch active org on session */
  setActive(_user: AuthzPrincipal): boolean {
    return true
  }
}
