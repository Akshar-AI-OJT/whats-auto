import { BasePolicy, AuthorizationResponse } from '@adonisjs/bouncer'
import { isOrgAdmin } from '#abilities/authz_predicates'
import type { AuthzPrincipal } from '#types/http'

export default class OrganizationAdminUserPolicy extends BasePolicy {
  viewAny(user: AuthzPrincipal): boolean | AuthorizationResponse {
    if (!isOrgAdmin(user)) {
      return AuthorizationResponse.deny(
        'Only organization admins can list organization users.',
        403
      )
    }
    return true
  }

  view = this.viewAny
  update = this.viewAny
  delete = this.viewAny
}
