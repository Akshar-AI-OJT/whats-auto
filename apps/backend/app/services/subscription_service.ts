import SubscriptionException from '#exceptions/subscription_exception'
import { insertAuthorizationAudit } from '#lib/authorization_audit'
import OrganizationSubscription from '#models/organization_subscription'
import { OrganizationService } from '#services/organization_service'
import { runWithTenant } from '#services/tenant_context'
import { SUBSCRIPTION_SOFT_DELETED_STATUS } from '#validators/subscription_crud'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

function toDateTime(date: DateTime | Date): DateTime {
  return date instanceof Date ? DateTime.fromJSDate(date) : date
}

function isEntitledStatus(status: string): boolean {
  return status === 'active' || status === 'trialing'
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

    // Query builder: DB columns are camelCase; Lucid orderBy would emit created_at.
    return db
      .from('organization_subscriptions')
      .whereNot('status', SUBSCRIPTION_SOFT_DELETED_STATUS)
      .orderBy('createdAt', 'desc')
      .paginate(page, perPage)
  }

  /**
   * Fetch one subscription by id for Super Admin.
   * Uses Knex (not Lucid) so the JSON shape matches {@link listSubscriptionsPaginated}.
   */
  async getSubscriptionById(subscriptionId: string) {
    const subscription = await db
      .from('organization_subscriptions')
      .where('id', subscriptionId)
      .whereNot('status', SUBSCRIPTION_SOFT_DELETED_STATUS)
      .first()

    if (!subscription) {
      throw SubscriptionException.notFound()
    }

    return subscription
  }

  /**
   * Create a subscription for an organization (Super Admin).
   * Uses runWithTenant so RLS WITH CHECK passes for the target organization.
   */
  async createSubscription(data: CreateSubscriptionInput, actorUserId?: string | null) {
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
      // Knex (not Lucid .create) — DB columns are camelCase; Lucid emits snake_case.
      const [created] = await db
        .table('organization_subscriptions')
        .insert({
          organizationId: data.organizationId,
          planId: data.planId,
          status: data.status,
          currentPeriodStart: start.toJSDate(),
          currentPeriodEnd: end.toJSDate(),
          cancelAt: data.cancelAt ? toDateTime(data.cancelAt).toJSDate() : null,
        })
        .returning('*')

      await insertAuthorizationAudit({
        organizationId: data.organizationId,
        actorUserId: actorUserId ?? null,
        targetType: 'subscription',
        targetId: created.id,
        eventType: 'subscription.created',
        after: { planId: created.planId, status: created.status },
      })

      if (isEntitledStatus(String(created.status))) {
        await new OrganizationService().promoteToActive(data.organizationId)
      }

      return created
    })
  }

  /**
   * Partial update for Super Admin. Only provided fields are changed.
   * Uses runWithTenant so RLS passes for the subscription's organization.
   */
  async updateSubscription(
    subscriptionId: string,
    patch: UpdateSubscriptionInput,
    actorUserId?: string | null
  ) {
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

    const updates: Record<string, unknown> = {}
    if (patch.planId !== undefined) updates.planId = patch.planId
    if (patch.status !== undefined) updates.status = patch.status
    if (patch.currentPeriodStart !== undefined) {
      updates.currentPeriodStart = periodStart.toJSDate()
    }
    if (patch.currentPeriodEnd !== undefined) {
      updates.currentPeriodEnd = periodEnd.toJSDate()
    }
    if (patch.cancelAt !== undefined) {
      updates.cancelAt = patch.cancelAt ? toDateTime(patch.cancelAt).toJSDate() : null
    }

    if (Object.keys(updates).length === 0) {
      return existing
    }

    return runWithTenant(existing.organizationId, async () => {
      // Knex update — Lucid .save() maps planId → plan_id and breaks camelCase columns.
      const [updated] = await db
        .from('organization_subscriptions')
        .where('id', subscriptionId)
        .update(updates)
        .returning('*')

      await insertAuthorizationAudit({
        organizationId: existing.organizationId,
        actorUserId: actorUserId ?? null,
        targetType: 'subscription',
        targetId: updated.id,
        eventType: 'subscription.updated',
        after: { planId: updated.planId, status: updated.status },
      })

      if (isEntitledStatus(String(updated.status))) {
        await new OrganizationService().promoteToActive(existing.organizationId)
      }

      return updated
    })
  }

  /**
   * Soft-delete a subscription without removing the row.
   * Uses status = cancelled and sets cancelAt (this table has no deletedAt column).
   */
  async softDeleteSubscription(subscriptionId: string, actorUserId?: string | null) {
    const subscription = await this.findSubscriptionIncludingDeleted(subscriptionId)

    if (subscription.status === SUBSCRIPTION_SOFT_DELETED_STATUS) {
      throw SubscriptionException.alreadyDeleted()
    }

    return runWithTenant(subscription.organizationId, async () => {
      await db.from('organization_subscriptions').where('id', subscriptionId).update({
        status: SUBSCRIPTION_SOFT_DELETED_STATUS,
        cancelAt: DateTime.utc().toJSDate(),
      })

      await insertAuthorizationAudit({
        organizationId: subscription.organizationId,
        actorUserId: actorUserId ?? null,
        targetType: 'subscription',
        targetId: subscriptionId,
        eventType: 'subscription.cancelled',
        after: { status: SUBSCRIPTION_SOFT_DELETED_STATUS },
      })
    })
  }
}
