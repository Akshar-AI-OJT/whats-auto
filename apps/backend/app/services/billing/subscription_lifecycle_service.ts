import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { BillingOrderRepository } from '#repositories/billing_order_repository'
import { OrganizationSubscriptionRepository } from '#repositories/organization_subscription_repository'
import { BILLING_GRACE_DAYS } from '#services/billing/billing_period'
import { notifyBillingOwnerBestEffort } from '#services/billing/billing_owner_notify'
import { runWithTenant } from '#services/tenant_context'

const REMINDER_DAYS = [7, 3, 1] as const
type ReminderDay = (typeof REMINDER_DAYS)[number]

function asMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function reminderKey(day: ReminderDay): string {
  return `t${day}`
}

/**
 * Hourly sweep: expire stale checkout orders, start grace, expire after grace,
 * send T-7 / T-3 / T-1 renewal reminders.
 */
export class SubscriptionLifecycleService {
  constructor(
    protected orders: BillingOrderRepository = new BillingOrderRepository(),
    protected subscriptions: OrganizationSubscriptionRepository = new OrganizationSubscriptionRepository()
  ) {}

  async run(params?: { organizationId?: string; now?: Date; limit?: number }): Promise<{
    expiredOrders: number
    pastDue: number
    expiredSubscriptions: number
    reminders: number
    scannedOrganizations: number
  }> {
    const now = params?.now ?? new Date()
    const limit = params?.limit ?? 100
    const organizationIds = await this.#organizationIds(params?.organizationId)

    let expiredOrders = 0
    let pastDue = 0
    let expiredSubscriptions = 0
    let reminders = 0

    for (const organizationId of organizationIds) {
      const result = await runWithTenant(organizationId, () =>
        this.#runForOrg(organizationId, now, limit)
      )
      expiredOrders += result.expiredOrders
      pastDue += result.pastDue
      expiredSubscriptions += result.expiredSubscriptions
      reminders += result.reminders
    }

    return {
      expiredOrders,
      pastDue,
      expiredSubscriptions,
      reminders,
      scannedOrganizations: organizationIds.length,
    }
  }

  async #runForOrg(organizationId: string, now: Date, limit: number) {
    const expiredOrders = await this.#expireOrders(organizationId, now, limit)
    const pastDue = await this.#markPastDue(organizationId, now, limit)
    const expiredSubscriptions = await this.#expireSubscriptions(organizationId, now, limit)
    const reminders = await this.#sendReminders(organizationId, now, limit)
    return { expiredOrders, pastDue, expiredSubscriptions, reminders }
  }

  async #expireOrders(organizationId: string, now: Date, limit: number): Promise<number> {
    const rows = await this.orders.listCreatedExpired({ organizationId, now, limit })
    for (const row of rows) {
      await this.orders.updateById({
        organizationId,
        orderId: row.id,
        patch: { status: 'expired' },
      })
    }
    return rows.length
  }

  async #markPastDue(organizationId: string, now: Date, limit: number): Promise<number> {
    const rows = await this.subscriptions.listActivePastPeriodEnd({ organizationId, now, limit })
    let count = 0
    for (const row of rows) {
      const periodEnd =
        row.currentPeriodEnd instanceof Date
          ? DateTime.fromJSDate(row.currentPeriodEnd)
          : DateTime.fromISO(String(row.currentPeriodEnd))
      const graceEndsAt = (periodEnd.isValid ? periodEnd : DateTime.fromJSDate(now))
        .toUTC()
        .plus({ days: BILLING_GRACE_DAYS })
        .toJSDate()

      await this.subscriptions.updateById({
        organizationId,
        subscriptionId: row.id,
        patch: {
          status: 'past_due',
          graceEndsAt,
        },
      })

      await notifyBillingOwnerBestEffort({
        organizationId,
        type: 'billing_subscription_past_due',
        title: 'Subscription past due',
        body: 'Your subscription is past due. Renew payment to keep access during the grace period.',
      })
      count += 1
    }
    return count
  }

  async #expireSubscriptions(organizationId: string, now: Date, limit: number): Promise<number> {
    const rows = await this.subscriptions.listPastDuePastGrace({ organizationId, now, limit })
    for (const row of rows) {
      await this.subscriptions.updateById({
        organizationId,
        subscriptionId: row.id,
        patch: {
          status: 'expired',
          endedAt: now,
        },
      })

      await notifyBillingOwnerBestEffort({
        organizationId,
        type: 'billing_subscription_expired',
        title: 'Subscription expired',
        body: 'Your subscription has expired. Renew to restore access.',
      })
    }
    return rows.length
  }

  async #sendReminders(organizationId: string, now: Date, limit: number): Promise<number> {
    const windowEnd = DateTime.fromJSDate(now).toUTC().plus({ days: 7 }).toJSDate()
    const rows = await this.subscriptions.listDueForRenewalReminder({
      organizationId,
      now,
      windowEnd,
      limit,
    })

    let sent = 0
    const nowMs = now.getTime()
    for (const row of rows) {
      const periodEnd = new Date(row.currentPeriodEnd).getTime()
      const daysLeft = Math.ceil((periodEnd - nowMs) / (24 * 60 * 60 * 1000))
      const bucket: ReminderDay | null =
        daysLeft <= 1 && daysLeft > 0
          ? 1
          : daysLeft <= 3 && daysLeft > 1
            ? 3
            : daysLeft <= 7 && daysLeft > 3
              ? 7
              : null
      if (!bucket) continue

      const metadata = asMetadata(row.metadata)
      const remindersSent =
        metadata.remindersSent && typeof metadata.remindersSent === 'object'
          ? { ...(metadata.remindersSent as Record<string, boolean>) }
          : {}
      const key = reminderKey(bucket)
      if (remindersSent[key]) continue

      await notifyBillingOwnerBestEffort({
        organizationId,
        type: 'billing_renewal_reminder',
        title: `Subscription renews in ${bucket} day${bucket === 1 ? '' : 's'}`,
        body: 'Renew now to avoid interruption when the current period ends.',
      })

      remindersSent[key] = true
      await this.subscriptions.updateById({
        organizationId,
        subscriptionId: row.id,
        patch: {
          metadata: { ...metadata, remindersSent },
        },
      })
      sent += 1
    }
    return sent
  }

  async #organizationIds(organizationId?: string): Promise<string[]> {
    if (organizationId) return [organizationId]
    const rows = await db
      .from('organizations')
      .whereNull('deletedAt')
      .where('status', 'active')
      .select('id')
    return rows.map((row) => row.id as string)
  }
}
