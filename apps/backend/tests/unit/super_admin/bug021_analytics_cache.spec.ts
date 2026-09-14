import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from '@japa/runner'

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../frontend')

async function readFrontend(relativePath: string) {
  return readFile(join(frontendRoot, relativePath), 'utf8')
}

function sliceFunction(source: string, name: string): string {
  const marker = `async function ${name}`
  const start = source.indexOf(marker)
  if (start < 0) return ''
  const from = source.slice(start)
  const next = from
    .slice(marker.length)
    .search(/\n {2}async function |\n {2}function |\n {2}return \(/)
  return next < 0 ? from : from.slice(0, marker.length + next)
}

test.group('BUG-021 Super Admin analytics cache invalidation', () => {
  test('list keys and analytics keys live in different React Query trees', async ({ assert }) => {
    const source = await readFrontend('lib/query-keys.ts')

    assert.include(source, "all: ['super-admin-analytics'] as const")
    assert.include(source, "organizations: ['super-admin-analytics', 'organizations'] as const")
    assert.include(source, "subscriptions: ['super-admin-analytics', 'subscriptions'] as const")
    assert.include(source, "invoiceSummary: ['super-admin-analytics', 'invoice-summary'] as const")
    assert.include(source, "summary: ['super-admin-analytics', 'summary'] as const")
    assert.include(source, 'organizations: (params?: Record<string, unknown>) =>')
    assert.include(source, "['admin', 'organizations', params ?? {}] as const")
    assert.include(source, "subscriptionsRoot: ['admin', 'subscriptions'] as const")
    assert.include(source, "invoicesRoot: ['admin', 'invoices'] as const")
    assert.notInclude(source, "['admin', 'analytics'")
  })

  test('analytics helper invalidates targeted Super Admin analytics keys only', async ({
    assert,
  }) => {
    const source = await readFrontend('lib/super-admin-analytics-cache.ts')

    assert.include(source, 'queryKeys.admin.analytics.all')
    assert.include(source, 'queryKeys.admin.analytics.subscriptions')
    assert.include(source, 'queryKeys.admin.analytics.summary')
    assert.include(source, 'invalidateAnalyticsAfterOrganizationMutation')
    assert.include(source, 'invalidateAnalyticsAfterInvoiceMutation')
    assert.include(source, 'invalidateAnalyticsAfterSubscriptionMutation')

    const subscriptionBlock = source.slice(
      source.indexOf('afterSubscriptionMutation'),
      source.indexOf('export async function invalidateAnalyticsAfterOrganizationMutation')
    )
    assert.include(subscriptionBlock, 'queryKeys.admin.analytics.subscriptions')
    assert.include(subscriptionBlock, 'queryKeys.admin.analytics.summary')
    assert.notInclude(subscriptionBlock, 'queryKeys.admin.analytics.all')
    assert.notInclude(source, 'queryClient.clear(')
    assert.notInclude(source, 'invalidateQueries()')
  })

  test('organization lifecycle mutations invalidate analytics.all without touching edit', async ({
    assert,
  }) => {
    const source = await readFrontend('components/admin/organizations/OrganizationsPage.tsx')

    assert.include(source, 'invalidateAnalyticsAfterOrganizationMutation')
    assert.include(
      sliceFunction(source, 'handleDeleteConfirm'),
      'invalidateAnalyticsAfterOrganizationMutation'
    )
    assert.include(
      sliceFunction(source, 'handleStatusConfirm'),
      'invalidateAnalyticsAfterOrganizationMutation'
    )
    assert.include(
      sliceFunction(source, 'handleStatusConfirm'),
      'queryKeys.admin.organizationDetail'
    )
    assert.notInclude(
      sliceFunction(source, 'handleEditSave'),
      'invalidateAnalyticsAfterOrganizationMutation'
    )
    assert.notInclude(source, 'queryClient.clear(')
    assert.notInclude(source, 'queryClient.invalidateQueries()')
  })

  test('invoice list mutations keep invoicesRoot and also invalidate analytics.all', async ({
    assert,
  }) => {
    const source = await readFrontend('components/admin/invoices/InvoicesPage.tsx')
    const refresh = sliceFunction(source, 'refreshInvoices')

    assert.include(refresh, 'queryKeys.admin.invoicesRoot')
    assert.include(refresh, 'invalidateAnalyticsAfterInvoiceMutation')
    assert.include(sliceFunction(source, 'handleMarkPaid'), 'refreshInvoices')
    assert.include(sliceFunction(source, 'handleRegenerate'), 'refreshInvoices')
    assert.notInclude(sliceFunction(source, 'handleSend'), 'refreshInvoices')
    assert.notInclude(source, 'queryKeys.admin.analytics.all')
    assert.notInclude(source, 'queryClient.clear(')
  })

  test('generating an invoice invalidates invoice lists and analytics.all', async ({ assert }) => {
    const source = await readFrontend('components/admin/invoices/GenerateInvoicePage.tsx')
    const generate = sliceFunction(source, 'handleGenerate')

    assert.include(generate, 'createInvoice')
    assert.include(generate, 'queryKeys.admin.invoicesRoot')
    assert.include(generate, 'invalidateAnalyticsAfterInvoiceMutation')
    assert.notInclude(source, 'queryClient.clear(')
  })

  test('subscription edit/cancel invalidate list root plus subscription analytics keys', async ({
    assert,
  }) => {
    const source = await readFrontend('components/admin/subscriptions/SubscriptionsPage.tsx')
    const refresh = sliceFunction(source, 'refreshSubscriptionQueries')

    assert.include(refresh, 'queryKeys.admin.subscriptionsRoot')
    assert.include(refresh, 'invalidateAnalyticsAfterSubscriptionMutation')
    assert.notInclude(refresh, 'queryKeys.admin.analytics.all')
    assert.include(sliceFunction(source, 'handleEditSave'), 'refreshSubscriptionQueries')
    assert.include(sliceFunction(source, 'handleDeleteConfirm'), 'refreshSubscriptionQueries')
    assert.notInclude(source, 'queryClient.clear(')
  })

  test('subscription details page uses the same analytics contract when present', async ({
    assert,
  }) => {
    const detailsPath = join(
      frontendRoot,
      'components/admin/subscriptions/SubscriptionDetailsPage.tsx'
    )
    if (!existsSync(detailsPath)) {
      const listPath = join(frontendRoot, 'components/admin/subscriptions/SubscriptionsPage.tsx')
      assert.isTrue(existsSync(listPath))
      return
    }

    const source = await readFile(detailsPath, 'utf8')
    assert.include(source, 'invalidateAnalyticsAfterSubscriptionMutation')
    assert.include(source, 'queryKeys.admin.subscriptionsRoot')
    assert.notInclude(source, "queryKey: ['admin', 'subscriptions']")
    assert.notInclude(source, 'queryKeys.admin.analytics.all')
    assert.notInclude(source, 'queryClient.clear(')
  })

  test('dashboard and analytics KPI queries use the super-admin-analytics tree and 60s staleTime', async ({
    assert,
  }) => {
    const kpi = await readFrontend('components/admin/overview/AdminKpiGrid.tsx')
    const growth = await readFrontend('components/admin/overview/OrganizationGrowthChart.tsx')
    const distribution = await readFrontend(
      'components/admin/overview/SubscriptionDistributionChart.tsx'
    )
    const revenue = await readFrontend('components/admin/overview/RevenueTrendChart.tsx')
    const analytics = await readFrontend('components/admin/analytics/PlatformAnalyticsPage.tsx')

    for (const source of [kpi, growth, distribution, revenue, analytics]) {
      assert.include(source, 'queryKeys.admin.analytics.')
      assert.include(source, '60_000')
      assert.notInclude(source, "queryKey: ['admin', 'organizations'")
      assert.notInclude(source, "queryKey: ['admin', 'subscriptions'")
      assert.notInclude(source, "queryKey: ['admin', 'invoices'")
    }

    assert.include(kpi, 'queryKeys.admin.analytics.organizations')
    assert.include(kpi, 'queryKeys.admin.analytics.subscriptions')
    assert.include(kpi, 'queryKeys.admin.analytics.invoiceSummary')
    assert.include(analytics, 'queryKeys.admin.analytics.summary')
    assert.include(analytics, 'queryKeys.admin.analytics.invoiceSummary')
    assert.include(revenue, 'queryKeys.admin.analytics.monthlyRevenue')
  })
})
