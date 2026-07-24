import { BookDemoBooking } from './BookDemoBooking'
import { BookDemoCTA } from './BookDemoCTA'
import { BookDemoExperience } from './BookDemoExperience'
import { BookDemoHero } from './BookDemoHero'
import { BookDemoWhy } from './BookDemoWhy'

export function BookDemoPage() {
  return (
    <main className="w-full flex-1 overflow-x-clip">
      <BookDemoHero />
      <BookDemoExperience />
      <BookDemoBooking />
      <BookDemoWhy />
      <BookDemoCTA />
    </main>
  )
}
