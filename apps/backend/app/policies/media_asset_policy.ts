import { BasePolicy, AuthorizationResponse } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export type MediaAssetResource = {
  id?: string
  organizationId: string
  state?: string
}

export default class MediaAssetPolicy extends BasePolicy {
  before(user: AuthzPrincipal): boolean | undefined {
    if (user.activeMember?.role === 'owner') return true
    return undefined
  }

  viewList(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('media:view') ?? false
  }

  view(user: AuthzPrincipal, asset?: MediaAssetResource): boolean {
    if (!(user.memberPermissions?.has('media:view') ?? false)) return false
    if (asset && asset.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return true
  }

  upload(user: AuthzPrincipal): boolean {
    return user.memberPermissions?.has('media:upload') ?? false
  }

  delete(user: AuthzPrincipal, asset?: MediaAssetResource): boolean {
    if (asset && asset.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    return user.memberPermissions?.has('media:delete') ?? false
  }

  restore(user: AuthzPrincipal, asset?: MediaAssetResource): boolean | AuthorizationResponse {
    if (asset && asset.organizationId !== user.activeMember?.organizationId) {
      return false
    }
    if (asset?.state && asset.state !== 'deleted') {
      return AuthorizationResponse.deny('Only soft-deleted media assets can be restored', 422)
    }
    return user.memberPermissions?.has('media:delete') ?? false
  }

  purge(user: AuthzPrincipal, asset?: MediaAssetResource): boolean | AuthorizationResponse {
    if (asset && asset.organizationId !== user.activeMember?.organizationId) {
      return AuthorizationResponse.deny('Media asset not found', 404)
    }
    if (asset?.state && asset.state !== 'deleted') {
      return AuthorizationResponse.deny('Only soft-deleted media assets can be purged', 422)
    }
    // Owner succeeds via before(). Non-owners need media:purge.
    if (!(user.memberPermissions?.has('media:purge') ?? false)) {
      return AuthorizationResponse.deny('Only organization owner can purge media assets', 403)
    }
    return true
  }
}
