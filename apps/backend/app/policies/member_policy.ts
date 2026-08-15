import { BasePolicy, AuthorizationResponse } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export type MemberResource = {
  id?: string
  organizationId: string
  userId?: string
  role?: string
}

export default class MemberPolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  viewList(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('team:view') ?? false
  }

  assignRole(user: AuthzPrincipal, targetMember?: MemberResource): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('team:role_assign')) {
      return AuthorizationResponse.deny('Permission denied: team:role_assign', 403)
    }
    if (targetMember) {
      if (targetMember.organizationId !== user.activeMember?.organizationId) {
        return AuthorizationResponse.deny('Member not found in active organization', 404)
      }
      if (targetMember.id === user.activeMember?.id) {
        return AuthorizationResponse.deny('Cannot change your own role', 422)
      }
      if (targetMember.role === 'owner') {
        return AuthorizationResponse.deny(
          'Cannot change the Owner role. Transfer ownership instead.',
          422
        )
      }
    }
    return true
  }

  remove(user: AuthzPrincipal, targetMember?: MemberResource): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('team:remove')) {
      return AuthorizationResponse.deny('Permission denied: team:remove', 403)
    }
    if (targetMember) {
      if (targetMember.organizationId !== user.activeMember?.organizationId) {
        return AuthorizationResponse.deny('Member not found in active organization', 404)
      }
      if (targetMember.role === 'owner') {
        return AuthorizationResponse.deny('Cannot remove the Owner. Transfer ownership first.', 422)
      }
    }
    return true
  }
}
