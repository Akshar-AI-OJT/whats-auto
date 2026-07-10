import { getSortedLandingSections } from '@/components/landing/registry'

export function LandingPage() {
  const sections = getSortedLandingSections()

  return (
    <main className="flex flex-1 flex-col">
      {sections.map(({ id, component: Section }) => (
        <Section key={id} />
      ))}
    </main>
  )
}
