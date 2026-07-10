import { getTranslations } from 'next-intl/server'

export default async function SmartRepliesContent() {
  const t = await getTranslations('features.smart-replies.content')

  return (
    <div className="flex flex-col gap-6 text-base text-muted-foreground md:text-lg">
      <p>{t('p1')}</p>
      <p>{t('p2')}</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>{t('highlight1')}</li>
        <li>{t('highlight2')}</li>
        <li>{t('highlight3')}</li>
      </ul>
    </div>
  )
}
