import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export type ContactResource = {
  id?: string
  organizationId: string
}

export default class ContactPolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  viewAny(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('contacts:view') ?? false
  }

  view(user: AuthzPrincipal, contact?: ContactResource): boolean {
    if (!user.memberPermissions?.has('contacts:view')) return false
    if (contact && contact.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  create(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('contacts:create') ?? false
  }

  import(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('contacts:import') ?? false
  }

  update(user: AuthzPrincipal, contact?: ContactResource): boolean {
    if (!user.memberPermissions?.has('contacts:edit')) return false
    if (contact && contact.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  delete(user: AuthzPrincipal, contact?: ContactResource): boolean {
    if (!user.memberPermissions?.has('contacts:delete')) return false
    if (contact && contact.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }
}
