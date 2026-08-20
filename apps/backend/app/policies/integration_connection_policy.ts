import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export type IntegrationConnectionResource = {
  id?: string
  organizationId: string
}

export default class IntegrationConnectionPolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  viewList(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('integrations:view') ?? false
  }

  view(user: AuthzPrincipal, connection?: IntegrationConnectionResource): boolean {
    if (!(user.memberPermissions?.has('integrations:view') ?? false)) return false
    if (connection && connection.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  upsert(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('integrations:manage') ?? false
  }

  destroy(user: AuthzPrincipal, connection?: IntegrationConnectionResource): boolean {
    if (!(user.memberPermissions?.has('integrations:manage') ?? false)) return false
    if (connection && connection.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }
}
