import type { HttpContext } from '@adonisjs/core/http'
import RoleException from '#exceptions/role_exception'

const MESSAGE_CODES: Record<string, string> = {
  'Cannot grant permissions you do not hold': 'E_PERMISSION_ESCALATION',
  'Cannot assign a role with permissions you do not hold': 'E_PERMISSION_ESCALATION',
  'Cannot change your own role': 'E_ROLE_SELF_ASSIGN',
  'Cannot change the Owner role directly. Use ownership transfer.': 'E_ROLE_CHANGE_OWNER',
  'Cannot remove the Owner. Transfer ownership first.': 'E_MEMBER_REMOVE_OWNER',
  'Cannot transfer ownership to the same member': 'E_OWNERSHIP_SAME_MEMBER',
  'Current owner not found or is no longer owner': 'E_OWNERSHIP_NOT_OWNER',
  'Target member not found in this organization': 'E_OWNERSHIP_TARGET_MISSING',
}

/**
 * Map known service Errors to 422 JSON. Let RoleException bubble to the exception handler.
 */
export function mapRbacError(error: unknown, response: HttpContext['response']) {
  if (error instanceof RoleException) {
    throw error
  }

  if (error instanceof Error) {
    const code = MESSAGE_CODES[error.message]
    if (code) {
      return response.unprocessableEntity({
        error: error.message,
        code,
      })
    }
  }

  throw error
}
