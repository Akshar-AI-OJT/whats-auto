import { getTranslations } from 'next-intl/server'

export default async function Home() {
  const t = await getTranslations('hero')

  return (
    <div className="flex flex-col flex-1 items-center justify-center px-4 py-16">
      <main className="flex max-w-3xl flex-col items-center gap-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
          {t('headline')}
        </h1>
        <p className="text-lg text-muted-foreground">{t('subheadline')}</p>
      </main>
    </div>
  )
}
