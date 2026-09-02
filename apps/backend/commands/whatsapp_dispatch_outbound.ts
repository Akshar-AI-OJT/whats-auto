import { hostname } from 'node:os'
import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import WhatsappOutboundService from '#services/whatsapp_outbound_service'

/**
 * Debug/manual runner for a single outbound dispatch.
 * Production wakes go through the job worker (BullMQ); this bypasses the queue
 * and calls executeDispatch directly.
 *
 * Example:
 *   node ace whatsapp:dispatch-outbound \
 *     --organization-id <uuid> \
 *     --dispatch-id <uuid>
 */
export default class WhatsappDispatchOutbound extends BaseCommand {
  static commandName = 'whatsapp:dispatch-outbound'
  static description =
    'Manually claim and execute one outbound_dispatches row (debug; prefer the job worker in production)'
  static options: CommandOptions = { startApp: true }

  @flags.string({
    flagName: 'organization-id',
    description: 'Organization UUID (tenant)',
  })
  declare organizationId: string

  @flags.string({
    flagName: 'dispatch-id',
    description: 'outbound_dispatches.id to claim',
  })
  declare dispatchId: string

  async run() {
    const missing = (['organizationId', 'dispatchId'] as const).filter((f) => !this[f])
    if (missing.length) {
      this.logger.error(
        `Missing required flags: ${missing
          .map((f) => (f === 'organizationId' ? 'organization-id' : 'dispatch-id'))
          .join(', ')}`
      )
      this.exitCode = 1
      return
    }

    const lockOwner = `ace:${hostname()}:${process.pid}`
    const service = new WhatsappOutboundService()

    this.logger.info(
      `Executing dispatch ${this.dispatchId} for org ${this.organizationId} (lockOwner=${lockOwner})`
    )

    const result = await service.executeDispatch({
      organizationId: this.organizationId,
      dispatchId: this.dispatchId,
      lockOwner,
    })

    switch (result.outcome) {
      case 'sent':
        this.logger.success(
          `sent messageId=${result.messageId} providerMessageId=${result.providerMessageId}`
        )
        break
      case 'already_sent':
        this.logger.info('already_sent (no Meta call)')
        break
      case 'not_claimed':
        this.logger.warning('not_claimed (locked, not due, or missing)')
        break
      case 'retry_scheduled':
        this.logger.warning(
          `retry_scheduled attempts=${result.attempts} nextAttemptAt=${result.nextAttemptAt} error=${result.errorMessage}`
        )
        break
      case 'failed':
        this.logger.error(`failed attempts=${result.attempts} error=${result.errorMessage}`)
        this.exitCode = 1
        break
      default: {
        const exhaustive: never = result
        this.logger.error(`unexpected outcome: ${JSON.stringify(exhaustive)}`)
        this.exitCode = 1
      }
    }
  }
}
