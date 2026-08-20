'use client'

import { useQuery } from '@tanstack/react-query'
import { api, type WhatsappConfigSummary } from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { unwrapList } from '@/components/dashboard/inbox/inbox-utils'
import { queryKeys } from '@/lib/query-keys'

export type WhatsappConfigsData = {
  configs: WhatsappConfigSummary[]
  isConnected: boolean
  primaryConfig: WhatsappConfigSummary | null
}

type UseWhatsappConfigsOptions = {
  /** Override the default permission/org gate. */
  enabled?: boolean
}

/**
 * Shared WhatsApp config query — dedupes dashboard home cards + connection page.
 */
export function useWhatsappConfigs(options: UseWhatsappConfigsOptions = {}) {
  const {
    tenantOrganizationId,
    canViewWhatsapp,
    isLoading: orgsLoading,
  } = useOrganizations()

  const enabled =
    options.enabled ??
    (!orgsLoading && Boolean(tenantOrganizationId) && canViewWhatsapp)

  return useQuery({
    queryKey: queryKeys.whatsapp.configs(tenantOrganizationId),
    queryFn: async (): Promise<WhatsappConfigsData> => {
      const { data } = await api.whatsapp.listConfigs()
      const configs = unwrapList<WhatsappConfigSummary>(data)
      return {
        configs,
        isConnected: configs.some((c) => c.status === 'connected'),
        primaryConfig: configs.find((c) => c.status === 'connected') ?? null,
      }
    },
    enabled,
    staleTime: 30_000,
  })
}
