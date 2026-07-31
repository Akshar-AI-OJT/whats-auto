import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/** Increment one member's version (role assign, ownership transfer). */
export async function bumpMemberPermissionVersion(
  trx: TransactionClientContract,
  memberId: string
): Promise<void> {
  await trx.from('organization_members').where('id', memberId).increment('permissionVersion', 1)
}

/** Increment every member holding a role in an organization (role edit/reset). */
export async function bumpMembersByRolePermissionVersion(
  trx: TransactionClientContract,
  organizationId: string,
  roleId: string
): Promise<void> {
  await trx
    .from('organization_members')
    .where('organizationId', organizationId)
    .where('roleId', roleId)
    .increment('permissionVersion', 1)
}

/** Increment every member in an organization (soft-delete / tenant-wide invalidation). */
export async function bumpAllOrgMembersPermissionVersion(
  trx: TransactionClientContract,
  organizationId: string
): Promise<void> {
  await trx
    .from('organization_members')
    .where('organizationId', organizationId)
    .increment('permissionVersion', 1)
}
