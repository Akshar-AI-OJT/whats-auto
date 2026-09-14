import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export type FlowResource = {
  id?: string
  organizationId: string
}

export default class FlowPolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  viewList(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('automations:view') ?? false
  }

  view(user: AuthzPrincipal, flow?: FlowResource): boolean {
    if (!user.memberPermissions?.has('automations:view')) return false
    if (flow && flow.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  create(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('automations:create') ?? false
  }

  update(user: AuthzPrincipal, flow?: FlowResource): boolean {
    if (!user.memberPermissions?.has('automations:edit')) return false
    if (flow && flow.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  publish(user: AuthzPrincipal, flow?: FlowResource): boolean {
    if (!user.memberPermissions?.has('automations:toggle')) return false
    if (flow && flow.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  destroy(user: AuthzPrincipal, flow?: FlowResource): boolean {
    if (!user.memberPermissions?.has('automations:delete')) return false
    if (flow && flow.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }
}
