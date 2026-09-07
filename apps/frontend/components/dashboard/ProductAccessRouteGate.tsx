'use client'

import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useProductAccess } from '@/hooks/useProductAccess'
import { getProductUnlockPath, isAlwaysAllowedDashboardPath } from '@/lib/product-access'

export function ProductAccessRouteGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations('dashboard')
  const pathname = usePathname()
  const router = useRouter()
  const { accessReady, hasFullProductAccess, isSetupComplete } = useProductAccess()
  const pathAllowed = isAlwaysAllowedDashboardPath(pathname)
  const canStay = pathAllowed || hasFullProductAccess

  useEffect(() => {
    if (!accessReady || canStay) return
    router.replace(getProductUnlockPath({ isSetupComplete }))
  }, [accessReady, canStay, isSetupComplete, router])

  if (canStay) return children

  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-mute">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {t('loading')}
    </div>
  )
}
