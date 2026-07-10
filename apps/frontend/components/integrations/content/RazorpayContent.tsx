import { getTranslations } from 'next-intl/server'

export default async function RazorpayContent() {
  const t = await getTranslations('integrations.razorpay.content')

  return (
    <div className="flex flex-col gap-6 text-base text-muted-foreground md:text-lg">
      <p>{t('p1')}</p>
      <ol className="list-decimal space-y-3 pl-5">
        <li>{t('step1')}</li>
        <li>{t('step2')}</li>
        <li>{t('step3')}</li>
      </ol>
      <p>{t('p2')}</p>
    </div>
  )
}
