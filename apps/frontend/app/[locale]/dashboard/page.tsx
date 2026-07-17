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
      <main className="flex flex-1 items-center justify-center bg-canvas-soft p-6">
        <p className="text-mute">{t('loading')}</p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 bg-canvas-soft p-6 md:p-10">
      <div>
        <h1 className="font-display-black text-3xl text-ink md:text-4xl">
          {t('title')}
        </h1>
        <p className="mt-2 text-body">{t('subtitle')}</p>
      </div>

      {user ? (
        <div className="rounded-xl bg-canvas p-6">
          <p className="font-semibold text-ink">
            {user.name || `${user.firstname} ${user.lastname}`.trim()}
          </p>
          <p className="mt-1 text-sm text-body">{user.email}</p>
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={() => void handleSignOut()}
      >
        {t('signOut')}
      </Button>
    </main>
  )
}
