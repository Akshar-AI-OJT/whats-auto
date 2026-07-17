'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import Image from 'next/image'

export interface InfoPoint {
  index: string
  key: string
  eyebrow: string
  title: string
  description: string
  bullets: string[]
  /** optional image path — falls back to a decorative index placeholder when omitted */
  image?: string
}

interface InfoSectionClientProps {
  title: string
  points: InfoPoint[]
}

export function InfoSectionClient({ title, points }: InfoSectionClientProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const blockRefs = useRef<(HTMLDivElement | null)[]>([])
  const mobileNavRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    mobileNavRefs.current[activeIndex]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [activeIndex])

  useEffect(() => {
    const triggerFraction = 0.45 // 45% down the viewport

    const updateActiveIndex = () => {
      const triggerY = window.innerHeight * triggerFraction
      let bestIdx = 0

      for (let i = 0; i < blockRefs.current.length; i++) {
        const el = blockRefs.current[i]
        if (!el) continue
        if (el.getBoundingClientRect().top <= triggerY) {
          bestIdx = i
        }
      }

      setActiveIndex(bestIdx)
    }

    updateActiveIndex()
    window.addEventListener('scroll', updateActiveIndex, { passive: true })
    window.addEventListener('resize', updateActiveIndex)
    return () => {
      window.removeEventListener('scroll', updateActiveIndex)
      window.removeEventListener('resize', updateActiveIndex)
    }
  }, [points.length])

  return (
    <section className="bg-canvas-light text-ink">
      {/* mobile scroll-spy nav: sticky strip with dot-pattern top/bottom borders */}
      <div className="sticky top-16 z-10 bg-canvas-light md:hidden">
        <div
          aria-hidden
          className="h-2 text-ink/20 bg-[radial-gradient(currentColor_1px,transparent_1px)] bg-size-[10px_10px]"
        />
        <nav
          aria-label={title}
          className="flex gap-6 overflow-x-auto px-4 py-3
                     [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden"
        >
          {points.map((point, idx) => (
            <button
              key={point.key}
              ref={(el) => {
                mobileNavRefs.current[idx] = el
              }}
              type="button"
              onClick={() =>
                blockRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
              className={cn(
                'font-eyebrow flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 text-xs tracking-wide uppercase transition-colors',
                idx === activeIndex ? 'bg-ink text-white' : 'text-mute'
              )}
            >
              <span>{point.index}</span>
              <span>{point.eyebrow}</span>
            </button>
          ))}
        </nav>
        <div
          aria-hidden
          className="h-2 text-ink/20 bg-[radial-gradient(currentColor_1px,transparent_1px)] bg-size-[10px_10px]"
        />
      </div>

      <div className="mx-auto max-w-screen-2xl px-4 py-16 md:px-8 md:py-24">
        <h2 className="font-display max-w-2xl text-4xl leading-[1.05] tracking-[-0.02em] text-ink md:text-6xl">
          {title}
        </h2>

        <div className="mt-16 grid grid-cols-1 gap-10 md:grid-cols-[180px_1fr]">
          <nav
            aria-label={title}
            className="hidden flex-col gap-1 md:sticky md:top-24 md:flex md:h-[calc(100vh-8rem)]"
          >
            {points.map((point, idx) => (
              <button
                key={point.key}
                type="button"
                onClick={() =>
                  blockRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
                className={cn(
                  'font-eyebrow flex items-center gap-2 rounded-md px-2 py-2 text-left text-xs tracking-wide uppercase transition-colors',
                  idx === activeIndex ? 'bg-ink text-white' : 'text-mute hover:text-ink'
                )}
              >
                <span>{point.index}</span>
                <span className="truncate">{point.eyebrow}</span>
              </button>
            ))}

            {/* decorative dot-grid, fills the rest of the sticky column */}
            <div
              aria-hidden
              className="mt-8 flex-1 text-ink-deep/8
                         bg-[radial-gradient(currentColor_2px,transparent_2px)]
                         bg-size-[14px_14px]"
            />
          </nav>

          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px] lg:gap-16">
            <div className="flex flex-col gap-16 sm:gap-20 md:gap-24 lg:gap-32">
              {points.map((point, idx) => (
                <div
                  key={point.key}
                  ref={(el) => {
                    blockRefs.current[idx] = el
                  }}
                  className="grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-16 lg:grid-cols-1 lg:gap-0"
                >
                  <div>
                    <p className="font-eyebrow text-xs tracking-wide text-brand uppercase">
                      {point.eyebrow}
                    </p>
                    <h3 className="font-display mt-3 text-3xl leading-tight tracking-[-0.02em] text-ink md:text-4xl">
                      {point.title}
                    </h3>
                    <p className="mt-4 text-base text-ink-soft md:text-lg">{point.description}</p>
                    <ul className="mt-6 flex flex-col gap-3 list-disc">
                      {point.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-2.5 text-sm text-ink-soft">
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* inline image fallback: only shown below lg, where the sticky
                      cross-fade column (below) has no room to render */}
                  <div className="lg:hidden">
                    <PointVisual point={point} />
                  </div>
                </div>
              ))}
            </div>

            {/* sticky image column: cross-fades between points as they scroll,
                only rendered at lg+ where there's a dedicated third column for it */}
            <div className="hidden lg:block">
              <div className="sticky top-24 h-[calc(100vh-8rem)] overflow-hidden rounded-xl">
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={points[activeIndex].key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: 'easeInOut' }}
                    className="absolute inset-0"
                  >
                    <PointVisual point={points[activeIndex]} fill />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function PointVisual({ point, fill = false }: { point: InfoPoint; fill?: boolean }) {
  const sizingClass = fill ? 'h-full w-full' : 'aspect-4/3 w-full'

  if (point.image) {
    return (
      <Image
        src={point.image}
        alt={point.title}
        className={cn(sizingClass, 'rounded-xl object-cover')}
      />
    )
  }

  return (
    <div
      aria-hidden
      className={cn('flex items-center justify-center rounded-xl bg-canvas-paper', sizingClass)}
    >
      <span className="font-display text-7xl text-ink/10">{point.index}</span>
    </div>
  )
}
