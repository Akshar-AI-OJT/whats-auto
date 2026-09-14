import { BasePolicy, AuthorizationResponse } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export type RoleResource = {
  roleKey?: string
  isSystem?: boolean
  organizationId?: string
}

export default class RolePolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  viewList(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('team:view') ?? false
  }

  create(user: AuthzPrincipal): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('roles:manage')) {
      return AuthorizationResponse.deny('Permission denied: roles:manage', 403)
    }
    return true
  }

  preview(user: AuthzPrincipal, role?: RoleResource): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('roles:manage')) {
      return AuthorizationResponse.deny('Permission denied: roles:manage', 403)
    }
    if (role?.roleKey === 'owner') {
      return AuthorizationResponse.deny('Role "owner" is protected', 422)
    }
    return true
  }

  update(user: AuthzPrincipal, role?: RoleResource): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('roles:manage')) {
      return AuthorizationResponse.deny('Permission denied: roles:manage', 403)
    }
    if (role?.roleKey === 'owner') {
      return AuthorizationResponse.deny('Role "owner" is protected', 422)
    }
    return true
  }

  reset(user: AuthzPrincipal, role?: RoleResource): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('roles:manage')) {
      return AuthorizationResponse.deny('Permission denied: roles:manage', 403)
    }
    if (role?.roleKey === 'owner') {
      return AuthorizationResponse.deny('Role "owner" is protected', 422)
    }
    return true
  }

  destroy(user: AuthzPrincipal, role?: RoleResource): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('roles:manage')) {
      return AuthorizationResponse.deny('Permission denied: roles:manage', 403)
    }
    if (role?.isSystem || ['admin', 'agent', 'viewer', 'owner'].includes(role?.roleKey ?? '')) {
      return AuthorizationResponse.deny('System roles cannot be deleted', 422)
    }
    return true
  }
}
