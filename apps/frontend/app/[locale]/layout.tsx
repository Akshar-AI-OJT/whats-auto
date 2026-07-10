import type { Metadata } from 'next'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { routing } from '@/i18n/routing'
import { cn } from '@/lib/utils'
import { notoSans, nunitoSans, inter } from '../fonts'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Whats-Auto',
  description: 'Automate WhatsApp like never before',
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <html
      lang={locale}
      className={cn(
        'h-full',
        'antialiased',
        notoSans.variable,
        nunitoSans.variable,
        inter.variable,
        'font-sans'
      )}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <Navbar />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
