import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { NotificationService } from '#services/notification_service'

/**
 * Best-effort owner notification. Never throws — billing mutations must not fail on notify.
 */
export async function notifyBillingOwnerBestEffort(params: {
  organizationId: string
  type: string
  title: string
  body: string
}): Promise<void> {
  try {
    const row = await db
      .from('organization_members')
      .join('roles', 'roles.id', 'organization_members.roleId')
      .where('organization_members.organizationId', params.organizationId)
      .where('roles.name', 'owner')
      .where('organization_members.isDeleted', false)
      .select('organization_members.userId')
      .first()

    const ownerUserId = (row?.userId as string | undefined) ?? null
    if (!ownerUserId) {
      logger.warn(
        { organizationId: params.organizationId, type: params.type },
        'billing.notification_skipped_no_owner'
      )
      return
    }

    await new NotificationService().createNotification({
      organizationId: params.organizationId,
      userId: ownerUserId,
      type: params.type,
      title: params.title,
      body: params.body,
    })
  } catch (error) {
    logger.error(
      {
        organizationId: params.organizationId,
        type: params.type,
        err: error instanceof Error ? error.message : 'unknown',
      },
      'billing.notification_failed'
    )
  }
}
