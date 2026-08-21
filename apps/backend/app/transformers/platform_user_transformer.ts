import { BaseTransformer } from '@adonisjs/core/transformers'
import type { PlatformUserRecord } from '#services/super_admin_platform_users_service'

export default class PlatformUserTransformer extends BaseTransformer<PlatformUserRecord> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'name',
      'firstname',
      'lastname',
      'email',
      'isActive',
      'status',
      'emailVerified',
      'createdAt',
      'updatedAt',
      'platformRole',
      'organizations',
    ])
  }
}
