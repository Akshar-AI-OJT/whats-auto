import SubscriptionException from '#exceptions/subscription_exception'
import OrganizationSubscription from '#models/organization_subscription'
import { runWithTenant } from '#services/tenant_context'
import { SUBSCRIPTION_SOFT_DELETED_STATUS } from '#validators/subscription_crud'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

function toDateTime(date: DateTime | Date): DateTime {
  return date instanceof Date ? DateTime.fromJSDate(date) : date
}

export type CreateSubscriptionInput = {
  organizationId: string
  planId: string
  status: string
  currentPeriodStart: DateTime | Date
  currentPeriodEnd: DateTime | Date
  cancelAt?: DateTime | Date
}

export type UpdateSubscriptionInput = {
  planId?: string
  status?: string
  currentPeriodStart?: DateTime | Date
  currentPeriodEnd?: DateTime | Date
  cancelAt?: DateTime | Date | null
}

export class SubscriptionService {
  /**
   * Base query for platform-wide subscription reads.
   * Excludes soft-deleted rows (status = cancelled).
   */
  protected subscriptionsQuery() {
    return OrganizationSubscription.query().whereNot('status', SUBSCRIPTION_SOFT_DELETED_STATUS)
  }

  /**
   * Load an active subscription or throw not found.
   */
  protected async findSubscriptionOrFail(subscriptionId: string) {
    const subscription = await this.subscriptionsQuery().where('id', subscriptionId).first()

    if (!subscription) {
      throw SubscriptionException.notFound()
    }

    return subscription
  }

  /**
   * Load a subscription regardless of soft-delete state.
   */
  protected async findSubscriptionIncludingDeleted(subscriptionId: string) {
    const subscription = await OrganizationSubscription.query().where('id', subscriptionId).first()

    if (!subscription) {
      throw SubscriptionException.notFound()
    }

    return subscription
  }

  /**
   * Platform-wide paginated subscription list for Super Admin.
   */
  async listSubscriptionsPaginated(params: { page: number; perPage: number }) {
    const { page, perPage } = params

    return this.subscriptionsQuery().orderBy('createdAt', 'desc').paginate(page, perPage)
  }

  /**
   * Fetch one subscription by id for Super Admin.
   */
  async getSubscriptionById(subscriptionId: string) {
    return this.findSubscriptionOrFail(subscriptionId)
  }

  /**
   * Create a subscription for an organization (Super Admin).
   * Uses runWithTenant so RLS WITH CHECK passes for the target organization.
   */
  async createSubscription(data: CreateSubscriptionInput) {
    const start = toDateTime(data.currentPeriodStart)
    const end = toDateTime(data.currentPeriodEnd)

    if (end <= start) {
      throw SubscriptionException.invalidPeriod()
    }

    const organization = await db
      .from('organizations')
      .where('id', data.organizationId)
      .whereNull('deletedAt')
      .select('id')
      .first()

    if (!organization) {
      throw SubscriptionException.organizationNotFound()
    }

    const plan = await db.from('plans').where('id', data.planId).select('id').first()

    if (!plan) {
      throw SubscriptionException.planNotFound()
    }

    return runWithTenant(data.organizationId, async () => {
      return OrganizationSubscription.create({
        organizationId: data.organizationId,
        planId: data.planId,
        status: data.status,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        cancelAt: data.cancelAt ? toDateTime(data.cancelAt) : null,
      })
    })
  }

  /**
   * Partial update for Super Admin. Only provided fields are changed.
   * Uses runWithTenant so RLS passes for the subscription's organization.
   */
  async updateSubscription(subscriptionId: string, patch: UpdateSubscriptionInput) {
    const existing = await this.findSubscriptionOrFail(subscriptionId)

    if (patch.planId !== undefined) {
      const plan = await db.from('plans').where('id', patch.planId).select('id').first()

      if (!plan) {
        throw SubscriptionException.planNotFound()
      }
    }

    const periodStart =
      patch.currentPeriodStart !== undefined
        ? toDateTime(patch.currentPeriodStart)
        : existing.currentPeriodStart
    const periodEnd =
      patch.currentPeriodEnd !== undefined
        ? toDateTime(patch.currentPeriodEnd)
        : existing.currentPeriodEnd

    if (periodEnd <= periodStart) {
      throw SubscriptionException.invalidPeriod()
    }

    const hasUpdates =
      patch.planId !== undefined ||
      patch.status !== undefined ||
      patch.currentPeriodStart !== undefined ||
      patch.currentPeriodEnd !== undefined ||
      patch.cancelAt !== undefined

    if (!hasUpdates) {
      return existing
    }

    return runWithTenant(existing.organizationId, async () => {
      if (patch.planId !== undefined) existing.planId = patch.planId
      if (patch.status !== undefined) existing.status = patch.status
      if (patch.currentPeriodStart !== undefined) {
        existing.currentPeriodStart = periodStart
      }
      if (patch.currentPeriodEnd !== undefined) {
        existing.currentPeriodEnd = periodEnd
      }
      if (patch.cancelAt !== undefined) {
        existing.cancelAt = patch.cancelAt ? toDateTime(patch.cancelAt) : null
      }

      await existing.save()
      return existing
    })
  }

  /**
   * Soft-delete a subscription without removing the row.
   * Uses status = cancelled and sets cancelAt (this table has no deletedAt column).
   */
  async softDeleteSubscription(subscriptionId: string) {
    const subscription = await this.findSubscriptionIncludingDeleted(subscriptionId)

    if (subscription.status === SUBSCRIPTION_SOFT_DELETED_STATUS) {
      throw SubscriptionException.alreadyDeleted()
    }

    return runWithTenant(subscription.organizationId, async () => {
      subscription.status = SUBSCRIPTION_SOFT_DELETED_STATUS
      subscription.cancelAt = DateTime.utc()
      await subscription.save()
    })
  }
}
