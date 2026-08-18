import { BasePolicy, AuthorizationResponse } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export type ConversationResource = {
  organizationId: string
  id?: string
  status?: string
  aiMode?: string
}

export default class ConversationPolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  viewAny(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('inbox:view') ?? false
  }

  view(user: AuthzPrincipal, conversation?: ConversationResource): boolean {
    if (!user.memberPermissions?.has('inbox:view')) return false
    if (conversation && conversation.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  create(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('inbox:view') ?? false
  }

  update(user: AuthzPrincipal, conversation?: ConversationResource): boolean {
    if (!user.memberPermissions?.has('inbox:view')) return false
    if (conversation && conversation.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  assign(user: AuthzPrincipal, conversation?: ConversationResource): boolean {
    if (!user.memberPermissions?.has('inbox:assign')) return false
    if (conversation && conversation.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  close(
    user: AuthzPrincipal,
    conversation?: ConversationResource
  ): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('inbox:close')) {
      return AuthorizationResponse.deny('Permission denied: inbox:close', 403)
    }
    if (conversation && conversation.organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny('Conversation not found', 404)
    }
    if (conversation?.status === 'closed') {
      return AuthorizationResponse.deny('Conversation is already closed', 422)
    }
    return true
  }

  reopen(
    user: AuthzPrincipal,
    conversation?: ConversationResource
  ): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('inbox:close')) {
      return AuthorizationResponse.deny('Permission denied: inbox:close', 403)
    }
    if (conversation && conversation.organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny('Conversation not found', 404)
    }
    if (conversation?.status && conversation.status !== 'closed') {
      return AuthorizationResponse.deny('Only closed conversations can be reopened', 422)
    }
    return true
  }

  takeoverAi(
    user: AuthzPrincipal,
    conversation?: ConversationResource
  ): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('inbox:reply')) return false
    if (conversation && conversation.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    if (conversation?.aiMode === 'HUMAN_ACTIVE') {
      return AuthorizationResponse.deny('Conversation is already under human control', 422)
    }
    return true
  }

  resumeAi(
    user: AuthzPrincipal,
    conversation?: ConversationResource
  ): boolean | AuthorizationResponse {
    if (!user.memberPermissions?.has('inbox:reply')) return false
    if (conversation && conversation.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    if (conversation?.aiMode === 'AI_AUTO') {
      return AuthorizationResponse.deny('Conversation AI mode is already AI_AUTO', 422)
    }
    return true
  }
}
