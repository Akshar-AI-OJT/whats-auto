import type { Metadata } from 'next'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { ConditionalChrome } from '@/components/layout/ConditionalChrome'
import { Footer } from '@/components/layout/Footer'
import { Navbar } from '@/components/layout/Navbar'
import { routing } from '@/i18n/routing'
import { cn } from '@/lib/utils'
import { manrope, inter, interBody, interHeading } from '../fonts'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Whats-Auto',
  description: 'Automate WhatsApp for sales, support, and marketing',
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
        'h-full antialiased',
        manrope.variable,
        inter.variable,
        interBody.variable,
        interHeading.variable,
        'font-sans'
      )}
    >
      <body className="flex min-h-full flex-col bg-canvas-soft text-ink">
        <NextIntlClientProvider messages={messages}>
          <ConditionalChrome>
            <Navbar />
          </ConditionalChrome>
          {children}
          <ConditionalChrome>
            <Footer />
          </ConditionalChrome>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
