'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { getPlatformBillingProfile } from './invoice-service'
import { EMPTY_PLATFORM_BILLING_PROFILE } from './types'

export function usePlatformBillingProfile() {
  const query = useQuery({
    queryKey: queryKeys.admin.invoiceBillingProfile,
    queryFn: getPlatformBillingProfile,
    staleTime: 60_000,
    placeholderData: EMPTY_PLATFORM_BILLING_PROFILE,
  })

  return {
    platform: query.data ?? EMPTY_PLATFORM_BILLING_PROFILE,
    isLoading: query.isLoading,
  }
}
