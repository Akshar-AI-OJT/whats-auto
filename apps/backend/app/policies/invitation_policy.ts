import { BasePolicy, AuthorizationResponse } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export default class InvitationPolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  viewAny(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('team:view') ?? false
  }

  store(user: AuthzPrincipal, organizationId: string): boolean | AuthorizationResponse {
    if (organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny(
        'Organization id does not match the active organization. Call set-active first.',
        403
      )
    }
    return user.memberPermissions?.has('team:invite') ?? false
  }

  cancel(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('team:invite') ?? false
  }
}
