import { AboutCTA } from './AboutCTA'
import { AboutHero } from './AboutHero'
import { AboutMission } from './AboutMission'
import { AboutValues } from './AboutValues'
import { AboutVision } from './AboutVision'
import { AboutWhy } from './AboutWhy'

export function AboutPage() {
  return (
    <main className="w-full flex-1 overflow-x-clip">
      <AboutHero />
      <AboutMission />
      <AboutWhy />
      <AboutValues />
      <AboutVision />
      <AboutCTA />
    </main>
  )
}
