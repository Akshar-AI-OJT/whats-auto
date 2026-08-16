import { BasePolicy } from '@adonisjs/bouncer'
import { isPlatformActor } from '#abilities/authz_predicates'
import type { AuthzPrincipal } from '#types/http'

export default class SuperAdminPolicy extends BasePolicy {
  /**
   * Coarse platform gate (same predicate as `accessPlatform` ability).
   * Granular `platform:*` checks still run in each action method.
   */
  before(user: AuthzPrincipal): boolean | undefined {
    if (!isPlatformActor(user)) return false
    return undefined
  }

  viewTenants(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('platform:tenants_view') ?? false
  }

  updateTenants(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('platform:tenants_update') ?? false
  }

  deleteTenants(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('platform:tenants_delete') ?? false
  }

  manageBilling(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('platform:tenants_billing') ?? false
  }

  viewAiConfig(user: AuthzPrincipal): boolean {
    return (
      user.memberPermissions?.has('platform:config_view') ||
      user.memberPermissions?.has('platform:config_manage') ||
      false
    )
  }

  manageAiConfig(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('platform:config_manage') ?? false
  }
}
