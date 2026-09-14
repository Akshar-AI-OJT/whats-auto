import { BasePolicy, AuthorizationResponse } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export default class OwnershipPolicy extends BasePolicy {
  transfer(user: AuthzPrincipal): boolean | AuthorizationResponse {
    if (user.activeMember?.role !== 'owner') {
      return AuthorizationResponse.deny('Only the organization owner can transfer ownership.', 403)
    }
    return true
  }
}
