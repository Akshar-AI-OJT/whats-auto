'use client'

import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

export default function DashboardPage() {
  const t = useTranslations('dashboard')
  const { user, isLoading, signOut } = useAuth()
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-muted-foreground">{t('loading')}</p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 md:p-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
      </div>

      {user ? (
        <div className="rounded-lg border border-border p-4">
          <p className="font-medium">
            {user.name || `${user.firstname} ${user.lastname}`.trim()}
          </p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      ) : null}

      <Button type="button" variant="outline" className="w-fit" onClick={() => void handleSignOut()}>
        {t('signOut')}
      </Button>
    </main>
  )
}
