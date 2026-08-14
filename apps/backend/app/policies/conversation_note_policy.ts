import { BasePolicy, AuthorizationResponse } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'
import type { ConversationResource } from '#policies/conversation_policy'

export default class ConversationNotePolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  viewList(user: AuthzPrincipal, conversation?: ConversationResource): boolean {
    if (!user.memberPermissions?.has('inbox:view')) return false
    if (conversation && conversation.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  create(user: AuthzPrincipal, conversation?: ConversationResource): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('inbox:reply')) {
      return AuthorizationResponse.deny('Permission denied: inbox:reply', 403)
    }
    if (conversation && conversation.organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny('Conversation not found', 404)
    }
    return true
  }
}
