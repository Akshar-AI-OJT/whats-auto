import { Exception } from '@adonisjs/core/exceptions'

/**
 * Tenant (organization) access / lifecycle violations with stable API codes.
 */
export default class TenantException extends Exception {
  static notFound() {
    return new this('Tenant not found.', {
      status: 404,
      code: 'E_TENANT_NOT_FOUND',
    })
  }

  static notAMember() {
    return new this('You are not a member of this tenant.', {
      status: 403,
      code: 'E_TENANT_NOT_A_MEMBER',
    })
  }

  static notOwner() {
    return new this('Only the tenant owner can perform this action.', {
      status: 403,
      code: 'E_TENANT_NOT_OWNER',
    })
  }

  static slugTaken(slug: string) {
    return new this(`Tenant slug "${slug}" is already taken.`, {
      status: 422,
      code: 'E_TENANT_SLUG_TAKEN',
    })
  }

  static invalidSlug(slug: string) {
    return new this(`Tenant slug "${slug}" is invalid.`, {
      status: 422,
      code: 'E_TENANT_INVALID_SLUG',
    })
  }
}
