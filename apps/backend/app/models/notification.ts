import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import {
  ContactSchema,
  ConversationSchema,
  NotificationSchema,
} from '#database/schema'
import Organization from '#models/organization'
import User from '#models/user'

/**
 * Relation targets for tables that do not yet have dedicated app model files.
 * Class names must resolve to `contacts` / `conversations` via Lucid naming.
 */
class Contact extends ContactSchema {}
class Conversation extends ConversationSchema {}

/**
 * Lucid model for the `notifications` table.
 * In-app notifications for agents (org-scoped).
 */
export default class Notification extends NotificationSchema {
  @belongsTo(() => Organization)
  declare organization: BelongsTo<typeof Organization>

  /**
   * Recipient agent (`userId`).
   */
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  /**
   * User who triggered the notification (`actorUserId`).
   */
  @belongsTo(() => User, { foreignKey: 'actorUserId' })
  declare actorUser: BelongsTo<typeof User>

  @belongsTo(() => Conversation)
  declare conversation: BelongsTo<typeof Conversation>

  @belongsTo(() => Contact)
  declare contact: BelongsTo<typeof Contact>
}
