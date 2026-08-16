import { BasePolicy, AuthorizationResponse } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export type KnowledgeDocumentResource = {
  id?: string
  organizationId: string
  deletedAt?: string | Date | null
}

export default class KnowledgeDocumentPolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  viewList(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('ai:kb_view') ?? false
  }

  view(user: AuthzPrincipal, doc?: KnowledgeDocumentResource): boolean {
    if (!user.memberPermissions?.has('ai:kb_view')) return false
    if (doc && doc.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  create(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('ai:kb_manage') ?? false
  }

  completeUpload(user: AuthzPrincipal, doc?: KnowledgeDocumentResource): boolean {
    if (!user.memberPermissions?.has('ai:kb_manage')) return false
    if (doc && doc.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  destroy(user: AuthzPrincipal, doc?: KnowledgeDocumentResource): boolean {
    if (!user.memberPermissions?.has('ai:kb_manage')) return false
    if (doc && doc.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  restore(user: AuthzPrincipal, doc?: KnowledgeDocumentResource): boolean | AuthorizationResponse {
    if (doc && doc.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    if (doc && !doc.deletedAt) {
      return AuthorizationResponse.deny(
        'Only soft-deleted knowledge documents can be restored',
        422
      )
    }
    return user.memberPermissions?.has('ai:kb_manage') ?? false
  }

  purge(user: AuthzPrincipal, doc?: KnowledgeDocumentResource): boolean | AuthorizationResponse {
    if (doc && doc.organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny('Knowledge document not found', 404)
    }
    if (doc && !doc.deletedAt) {
      return AuthorizationResponse.deny('Only soft-deleted knowledge documents can be purged', 422)
    }
    return user.memberPermissions?.has('ai:kb_manage') ?? false
  }
}
