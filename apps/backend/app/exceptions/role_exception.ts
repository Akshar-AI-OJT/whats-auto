import { Exception } from '@adonisjs/core/exceptions'

/**
 * Role / membership graph violations with stable API codes.
 */
export default class RoleException extends Exception {
  static reservedKey(role: string) {
    return new this(`Role key "${role}" is reserved`, {
      status: 422,
      code: 'E_ROLE_RESERVED',
    })
  }

  static invalidKey(role: string) {
    return new this(`Role key "${role}" is invalid`, {
      status: 422,
      code: 'E_ROLE_INVALID_KEY',
    })
  }

  static protectedRole(role: string) {
    return new this(`Role "${role}" is protected`, {
      status: 422,
      code: 'E_ROLE_PROTECTED',
    })
  }

  static replacementMissing(replacementRole: string) {
    return new this(`Replacement role "${replacementRole}" does not exist`, {
      status: 422,
      code: 'E_ROLE_REPLACEMENT_MISSING',
    })
  }

  static replacementSameAsDeleted() {
    return new this('replacementRole must differ from the role being deleted', {
      status: 422,
      code: 'E_ROLE_REPLACEMENT_SAME',
    })
  }

  static cannotAssignOwner() {
    return new this('Cannot assign the owner role directly. Use ownership transfer.', {
      status: 422,
      code: 'E_ROLE_ASSIGN_OWNER',
    })
  }
}
