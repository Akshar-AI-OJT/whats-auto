import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export default class FlowCatalogPolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  viewList(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('automations:view') ?? false
  }

  install(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('automations:create') ?? false
  }
}
