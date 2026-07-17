'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import { cn } from '@/lib/utils'
import Image from 'next/image'

export interface WhyPoint {
  index: string
  key: string
  eyebrow: string
  title: string
  description: string
  bullets: string[]
  image?: string
}

interface WhyChooseUsClientProps {
  title: string
  points: WhyPoint[]
}

export function WhyChooseUsClient({ title, points }: WhyChooseUsClientProps) {
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
    const nodes = blockRefs.current.filter(Boolean) as HTMLDivElement[]
    if (!nodes.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (!visible[0]) return
        const idx = nodes.indexOf(visible[0].target as HTMLDivElement)
        if (idx >= 0) setActiveIndex(idx)
      },
      { rootMargin: '-35% 0px -45% 0px', threshold: [0.1, 0.4, 0.7] }
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [points.length])

  return (
    <MotionConfig reducedMotion="never">
    <section className="bg-canvas-soft text-ink">
      <div className="sticky top-16 z-10 bg-canvas-soft md:hidden">
        <nav
          aria-label={title}
          className="flex gap-3 overflow-x-auto px-4 py-3 [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden"
        >
          {points.map((point, idx) => (
            <button
              key={point.key}
              ref={(el) => {
                mobileNavRefs.current[idx] = el
              }}
              type="button"
              onClick={() =>
                blockRefs.current[idx]?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
                })
              }
              className={cn(
                'font-eyebrow flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs uppercase transition-colors',
                idx === activeIndex ? 'bg-ink text-primary' : 'bg-canvas text-mute'
              )}
            >
              <span>{point.index}</span>
              <span>{point.eyebrow}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-6 md:py-24">
        <h2 className="font-display-black max-w-2xl text-3xl text-ink md:text-5xl">
          {title}
        </h2>

        <div className="mt-12 grid grid-cols-1 gap-10 md:mt-16 md:grid-cols-[160px_1fr] md:gap-12">
          <nav
            aria-label={title}
            className="hidden flex-col gap-1 md:sticky md:top-24 md:flex md:h-[calc(100vh-8rem)]"
          >
            {points.map((point, idx) => (
              <button
                key={point.key}
                type="button"
                onClick={() =>
                  blockRefs.current[idx]?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                  })
                }
                className={cn(
                  'font-eyebrow flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs uppercase transition-colors',
                  idx === activeIndex
                    ? 'bg-ink text-primary'
                    : 'text-mute hover:bg-canvas hover:text-ink'
                )}
              >
                <span>{point.index}</span>
                <span className="truncate">{point.eyebrow}</span>
              </button>
            ))}
          </nav>

          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px] lg:gap-12">
            <div className="flex flex-col gap-16 sm:gap-20 md:gap-24 lg:gap-32">
              {points.map((point, idx) => (
                <div
                  key={point.key}
                  ref={(el) => {
                    blockRefs.current[idx] = el
                  }}
                  className="grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-12 lg:grid-cols-1 lg:gap-0"
                >
                  <div>
                    <p className="font-eyebrow text-xs uppercase text-brand">
                      {point.eyebrow}
                    </p>
                    <h3 className="font-display mt-3 text-2xl text-ink md:text-4xl">
                      {point.title}
                    </h3>
                    <p className="mt-4 text-base text-body md:text-lg">
                      {point.description}
                    </p>
                    <ul className="mt-6 flex flex-col gap-3">
                      {point.bullets.map((bullet) => (
                        <li
                          key={bullet}
                          className="flex items-start gap-2.5 text-sm text-body"
                        >
                          <span
                            aria-hidden
                            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                          />
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="lg:hidden">
                    <PointVisual point={point} />
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden lg:block">
              <div className="sticky top-24 h-[calc(100vh-8rem)] overflow-hidden rounded-xl bg-canvas">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={points[activeIndex].key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, ease: 'easeInOut' }}
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
    </MotionConfig>
  )
}

function PointVisual({ point, fill = false }: { point: WhyPoint; fill?: boolean }) {
  const sizingClass = fill ? 'h-full w-full' : 'aspect-4/3 w-full'

  if (point.image) {
    return (
      <Image
        src={point.image}
        alt={point.title}
        fill={fill}
        className={cn(sizingClass, 'rounded-xl object-cover')}
      />
    )
  }

  return (
    <div
      aria-hidden
      className={cn(
        'flex items-center justify-center rounded-xl bg-primary-pale',
        sizingClass
      )}
    >
      <span className="font-display-black text-7xl text-ink/10">{point.index}</span>
    </div>
  )
}
