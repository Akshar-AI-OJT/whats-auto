import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { PlanRepository } from '#repositories/plan_repository'
import { PlanService } from '#services/billing/plan_service'
import { cleanupDuplicateActivePlans } from '#services/billing/plan_duplicate_cleanup'
import { EntitlementService } from '#services/billing/entitlement_service'
import { runWithTenant } from '#services/tenant_context'
import { derivePlanStatus } from '#transformers/plan_transformer'
import { withActivePlanIdentityIndexDropped } from '#tests/helpers/plan_identity_index'

test.group('Duplicate active plan cleanup', (group) => {
  group.tap((t) => t.timeout(20_000))

  test('identifies groups, re-points live billing FKs, and leaves invoice snapshots', async ({
    assert,
  }) => {
    const suffix = randomUUID().slice(0, 8)
    const organizationId = randomUUID()
    const canonicalId = randomUUID()
    const duplicateId = randomUUID()
    const subscriptionId = randomUUID()
    const slug = `dup-cl-${suffix}`

    await withActivePlanIdentityIndexDropped(async () => {
      try {
        await db.table('organizations').insert({
          id: organizationId,
          name: `Dup Cleanup ${slug}`,
          slug,
          email: `${slug}@example.com`,
          country: 'IN',
          timezone: 'UTC',
          currency: 'INR',
          status: 'active',
        })

        await db.table('plans').insert([
          {
            id: canonicalId,
            code: `cln_keep_${suffix}`,
            name: `Cleanup Growth ${suffix}`,
            price: 2499,
            currency: 'INR',
            billingInterval: 'month',
            billingIntervalCount: 1,
            trialDays: 0,
            gateway: null,
            gatewayPlanId: null,
            limits: { seats: 15, messagesPerMonth: 10000 },
            isActive: true,
            sortOrder: 20,
            metadata: { status: 'active' },
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
          {
            id: duplicateId,
            code: `cln_dup_${suffix}`,
            name: `Cleanup Growth ${suffix}`,
            price: 2499,
            currency: 'INR',
            billingInterval: 'month',
            billingIntervalCount: 1,
            trialDays: 0,
            gateway: null,
            gatewayPlanId: null,
            limits: { seats: 15, messagesPerMonth: 10000 },
            isActive: true,
            sortOrder: 21,
            metadata: { status: 'active' },
            createdAt: new Date('2026-06-01T00:00:00.000Z'),
          },
        ])

        await runWithTenant(organizationId, async () => {
          await db.table('organization_subscriptions').insert({
            id: subscriptionId,
            organizationId,
            planId: canonicalId,
            status: 'active',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
            metadata: {},
          })

          await db.table('billing_orders').insert({
            organizationId,
            planId: duplicateId,
            gateway: 'razorpay',
            gatewayOrderId: `order_cln_${suffix}`,
            purpose: 'new_subscription',
            status: 'paid',
            amount: 2499,
            taxRate: 0,
            tax: 0,
            total: 2499,
            currency: 'INR',
            periodStart: new Date(),
            periodEnd: new Date(Date.now() + 30 * 86400000),
            planSnapshot: {
              code: `cln_dup_${suffix}`,
              name: `Cleanup Growth ${suffix}`,
              price: 2499,
              currency: 'INR',
              interval: 'month',
              intervalCount: 1,
              limits: {},
            },
            metadata: {},
          })

          await db.table('invoices').insert({
            organizationId,
            subscriptionId,
            planId: duplicateId,
            invoiceNumber: `INV-CLN-${suffix}`,
            status: 'paid',
            billingPeriod: 'monthly',
            planName: `Cleanup Growth ${suffix}`,
            periodStart: new Date(),
            periodEnd: new Date(Date.now() + 30 * 86400000),
            issueDate: new Date(),
            dueDate: new Date(),
            currency: 'INR',
            subtotal: 2499,
            taxRate: 0,
            tax: 0,
            discount: 0,
            total: 2499,
            billToName: 'Cleanup Org',
            billToEmail: `${slug}@example.com`,
            metadata: {},
          })
        })

        const result = await cleanupDuplicateActivePlans()
        const group = result.groups.find((item) => item.canonicalId === canonicalId)
        assert.exists(group)
        assert.include(group!.archivedIds, duplicateId)

        const subscription = await runWithTenant(organizationId, async () => {
          return db.from('organization_subscriptions').where('id', subscriptionId).first()
        })
        const order = await runWithTenant(organizationId, async () => {
          return db.from('billing_orders').where('gatewayOrderId', `order_cln_${suffix}`).first()
        })
        const invoice = await runWithTenant(organizationId, async () => {
          return db.from('invoices').where('invoiceNumber', `INV-CLN-${suffix}`).first()
        })

        assert.equal(subscription?.planId, canonicalId)
        assert.equal(order?.planId, canonicalId)
        assert.equal(invoice?.planId, duplicateId)
        assert.equal(invoice?.planName, `Cleanup Growth ${suffix}`)
        assert.equal(Number(invoice?.total), 2499)

        const duplicate = await db.from('plans').where('id', duplicateId).first()
        const canonical = await db.from('plans').where('id', canonicalId).first()
        assert.isFalse(duplicate?.isActive)
        assert.equal(derivePlanStatus(duplicate), 'archived')
        assert.isTrue(canonical?.isActive)

        const seats = await new EntitlementService().getNumericLimit(organizationId, 'seats')
        assert.equal(seats, 15)
        const messages = await new EntitlementService().getNumericLimit(
          organizationId,
          'messagesPerMonth'
        )
        assert.equal(messages, 10000)

        const catalog = await new PlanService(new PlanRepository()).listTenantPlans()
        const matches = catalog.items.filter((item) => item.name === `Cleanup Growth ${suffix}`)
        assert.lengthOf(matches, 1)
        assert.equal(matches[0].id, canonicalId)
      } finally {
        await runWithTenant(organizationId, async () => {
          await db.from('invoices').where('invoiceNumber', `INV-CLN-${suffix}`).delete()
          await db.from('billing_orders').where('gatewayOrderId', `order_cln_${suffix}`).delete()
          await db.from('organization_subscriptions').where('id', subscriptionId).delete()
        })
        await db.from('plans').whereIn('id', [canonicalId, duplicateId]).delete()
        await db.from('organizations').where('id', organizationId).delete()
      }
    })
  })

  test('keeps the referenced newer plan as canonical', async ({ assert }) => {
    const suffix = randomUUID().slice(0, 8)
    const organizationId = randomUUID()
    const unusedOlderId = randomUUID()
    const referencedNewerId = randomUUID()
    const subscriptionId = randomUUID()
    const slug = `dup-ref-${suffix}`

    await withActivePlanIdentityIndexDropped(async () => {
      try {
        await db.table('organizations').insert({
          id: organizationId,
          name: `Dup Ref ${slug}`,
          slug,
          email: `${slug}@example.com`,
          country: 'IN',
          timezone: 'UTC',
          currency: 'INR',
          status: 'active',
        })

        await db.table('plans').insert([
          {
            id: unusedOlderId,
            code: `ref_old_${suffix}`,
            name: `Ref Growth ${suffix}`,
            price: 1800,
            currency: 'INR',
            billingInterval: 'month',
            billingIntervalCount: 1,
            trialDays: 0,
            gateway: null,
            gatewayPlanId: null,
            limits: { seats: 8 },
            isActive: true,
            sortOrder: 20,
            metadata: { status: 'active' },
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
          {
            id: referencedNewerId,
            code: `ref_new_${suffix}`,
            name: `Ref Growth ${suffix}`,
            price: 1800,
            currency: 'INR',
            billingInterval: 'month',
            billingIntervalCount: 1,
            trialDays: 0,
            gateway: null,
            gatewayPlanId: null,
            limits: { seats: 8 },
            isActive: true,
            sortOrder: 21,
            metadata: { status: 'active' },
            createdAt: new Date('2026-08-01T00:00:00.000Z'),
          },
        ])

        await runWithTenant(organizationId, async () => {
          await db.table('organization_subscriptions').insert({
            id: subscriptionId,
            organizationId,
            planId: referencedNewerId,
            status: 'active',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
            metadata: {},
          })
        })

        const result = await cleanupDuplicateActivePlans()
        const group = result.groups.find((item) => item.canonicalId === referencedNewerId)
        assert.exists(group)
        assert.include(group!.archivedIds, unusedOlderId)

        const subscription = await runWithTenant(organizationId, async () => {
          return db.from('organization_subscriptions').where('id', subscriptionId).first()
        })
        assert.equal(subscription?.planId, referencedNewerId)

        const unused = await db.from('plans').where('id', unusedOlderId).first()
        const kept = await db.from('plans').where('id', referencedNewerId).first()
        assert.isFalse(unused?.isActive)
        assert.isTrue(kept?.isActive)
      } finally {
        await runWithTenant(organizationId, async () => {
          await db.from('organization_subscriptions').where('id', subscriptionId).delete()
        })
        await db.from('plans').whereIn('id', [unusedOlderId, referencedNewerId]).delete()
        await db.from('organizations').where('id', organizationId).delete()
      }
    })
  })
})
