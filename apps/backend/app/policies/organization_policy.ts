import { BasePolicy, AuthorizationResponse } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export default class OrganizationPolicy extends BasePolicy {
  /**
   * Do not owner-bypass here. `before()` cannot see the target organization id, so
   * returning true would allow PATCH /organizations/:otherId while the session is
   * still on a different tenant.
   */
  before(_user: AuthzPrincipal): boolean | undefined {
    return undefined
  }

  /** Update org profile/settings — requires active org match, then owner or org:settings_manage */
  update(user: AuthzPrincipal, organizationId: string): boolean | AuthorizationResponse {
    if (organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny(
        'Organization id does not match the active organization. Call set-active first.',
        403
      )
    }
    if (user.activeMember?.role === 'owner') return true
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
    return true
  }

  /** Switch active org on session */
  setActive(_user: AuthzPrincipal): boolean {
    return true
  }
}
