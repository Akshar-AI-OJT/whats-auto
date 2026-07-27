import { FeaturesAurora } from '@/components/features/page/FeaturesAurora'
import { BookDemoBookingPanel } from './BookDemoBookingPanel'

export function BookDemoBooking() {
  return (
    <section
      id="booking"
      className="relative scroll-mt-24 overflow-x-clip bg-[#F8FAFC] py-16 sm:py-20 md:py-24"
    >
      <FeaturesAurora />
      <div className="relative z-10 mx-auto max-w-[1200px] px-4 sm:px-6">
        <BookDemoBookingPanel />
      </div>
    </section>
  )
}
