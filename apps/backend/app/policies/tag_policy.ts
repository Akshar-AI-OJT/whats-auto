import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export type TagResource = {
  id?: string
  organizationId: string
}

export default class TagPolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  viewList(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('contacts:view') ?? false
  }

  view(user: AuthzPrincipal, tag?: TagResource): boolean {
    if (!user.memberPermissions?.has('contacts:view')) return false
    if (tag && tag.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  create(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('contacts:create') ?? false
  }

  update(user: AuthzPrincipal, tag?: TagResource): boolean {
    if (!user.memberPermissions?.has('contacts:edit')) return false
    if (tag && tag.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  destroy(user: AuthzPrincipal, tag?: TagResource): boolean {
    if (!user.memberPermissions?.has('contacts:delete')) return false
    if (tag && tag.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  assignContact(user: AuthzPrincipal, tag?: TagResource): boolean {
    if (!user.memberPermissions?.has('contacts:edit')) return false
    if (tag && tag.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  removeContact(user: AuthzPrincipal, tag?: TagResource): boolean {
    if (!user.memberPermissions?.has('contacts:edit')) return false
    if (tag && tag.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }
}
