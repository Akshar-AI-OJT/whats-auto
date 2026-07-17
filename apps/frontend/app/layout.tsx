import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Whats-Auto',
  description: 'Automate WhatsApp for sales, support, and marketing',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
