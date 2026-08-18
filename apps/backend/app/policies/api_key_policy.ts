import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export type ApiKeyResource = {
  id?: string
  organizationId: string
}

export default class ApiKeyPolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  viewList(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('integrations:view') ?? false
  }

  view(user: AuthzPrincipal, apiKey?: ApiKeyResource): boolean {
    if (!(user.memberPermissions?.has('integrations:view') ?? false)) return false
    if (apiKey && apiKey.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  create(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('integrations:manage') ?? false
  }

  revoke(user: AuthzPrincipal, apiKey?: ApiKeyResource): boolean {
    if (!(user.memberPermissions?.has('integrations:manage') ?? false)) return false
    if (apiKey && apiKey.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }
}
