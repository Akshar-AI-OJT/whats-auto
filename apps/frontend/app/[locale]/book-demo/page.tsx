import type { Metadata } from 'next'
import { BookDemoPage } from '@/components/book-demo/BookDemoPage'

export const metadata: Metadata = {
  title: 'Book a Demo — Whats-Auto',
  description: 'Book a Whats-Auto product demo.',
}

export default function BookDemoRoutePage() {
  return <BookDemoPage />
}
