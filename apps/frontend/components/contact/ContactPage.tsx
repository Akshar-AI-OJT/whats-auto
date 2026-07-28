'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ContactPage() {
  const t = useTranslations('contactPage')

  return (
    <main className="w-full flex-1 overflow-x-clip">
      <section className="border-b border-[#E2E8F0] bg-canvas">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-14 sm:px-6 md:py-16 lg:py-20">
          <div className="max-w-3xl">
            <h1 className="font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl">
              {t('title')}
            </h1>
            <p className="mt-4 text-base leading-7 text-body">{t('description')}</p>
            <p className="mt-4 text-sm text-mute">
              {t('emailLabel')}{' '}
              <a
                href={`mailto:${t('email')}`}
                className="font-medium text-positive-deep underline-offset-2 hover:underline"
              >
                {t('email')}
              </a>
            </p>
          </div>
        </div>
      </section>

      <section className="bg-canvas-soft">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6 md:py-14 lg:py-16">
          <div className="mx-auto max-w-3xl rounded-2xl border border-[#E2E8F0] bg-canvas p-5 shadow-[0_8px_30px_rgb(15_23_42/0.05)] sm:p-6 md:p-8">
            <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
              <div className="space-y-2">
                <label htmlFor="contact-name" className="text-sm font-medium text-ink">
                  {t('form.name')}
                </label>
                <Input id="contact-name" name="name" type="text" placeholder={t('placeholders.name')} />
              </div>

              <div className="space-y-2">
                <label htmlFor="contact-email" className="text-sm font-medium text-ink">
                  {t('form.email')}
                </label>
                <Input
                  id="contact-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  placeholder={t('placeholders.email')}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="contact-message" className="text-sm font-medium text-ink">
                  {t('form.message')}
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  rows={6}
                  placeholder={t('placeholders.message')}
                  className="w-full min-w-0 resize-y rounded-md border border-ink bg-canvas px-4 py-3 text-base leading-6 text-ink shadow-none outline-none transition-[color,background-color,border-color,box-shadow] placeholder:text-mute hover:border-body focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-primary/50"
                />
              </div>

              <Button type="submit" size="lg" className="w-full sm:w-auto">
                {t('form.submit')}
              </Button>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}
