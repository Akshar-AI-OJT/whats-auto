import db from '@adonisjs/lucid/services/db'
import CampaignException from '#exceptions/campaign_exception'

/**
 * Shared campaign kickoff / execute preflight checks.
 * Used by CampaignService (HTTP schedule/send) and CampaignExecutionService
 * so approval and connectivity rules cannot diverge.
 */
export async function assertApprovedTemplate(
  organizationId: string,
  templateId: string
): Promise<void> {
  const template = await db
    .from('message_templates')
    .where('id', templateId)
    .where('organizationId', organizationId)
    .select('id', 'status')
    .first()

  if (!template) {
    throw CampaignException.messageTemplateNotFound()
  }
  if (String(template.status).toLowerCase() !== 'approved') {
    throw CampaignException.templateNotApproved()
  }
}

export async function assertConnectedWhatsappConfig(
  organizationId: string,
  whatsappConfigId: string
): Promise<void> {
  const config = await db
    .from('whatsapp_configs')
    .where('id', whatsappConfigId)
    .where('organizationId', organizationId)
    .select('id', 'status')
    .first()

  if (!config) {
    throw CampaignException.whatsappConfigNotFound()
  }
  if (config.status !== 'connected') {
    throw CampaignException.whatsappConfigNotConnected()
  }
}

export async function assertReadyMediaAsset(
  organizationId: string,
  mediaAssetId: string
): Promise<void> {
  const asset = await db
    .from('media_assets')
    .where('id', mediaAssetId)
    .where('organizationId', organizationId)
    .where('state', 'ready')
    .select('id')
    .first()

  if (!asset) {
    throw CampaignException.invalidReference()
  }
}
