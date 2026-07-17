'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'

interface RotatingHeadlineProps {
  prefix: string
  words1: string[]
  words2: string[]
  suffix: string
  /** ms between word-pair swaps */
  interval?: number
}

/**
 * "The #1 [word1] [word2] platform" with word1/word2 rotating together.
 * Each highlight box sizes to its active word.
 */
export function RotatingHeadline({
  prefix,
  words1,
  words2,
  suffix,
  interval = 2600,
}: RotatingHeadlineProps) {
  const [index, setIndex] = useState(0)
  const length = Math.min(words1.length, words2.length)

  useEffect(() => {
    if (length <= 1) return
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % length)
    }, interval)
    return () => clearInterval(id)
  }, [length, interval])

  return (
    <MotionConfig reducedMotion="never">
      <h1 className="font-display-black flex flex-wrap items-center justify-center gap-x-3 gap-y-3 text-center text-[2.5rem] text-ink sm:text-5xl md:text-6xl lg:text-[4rem]">
        <span className="whitespace-nowrap">{prefix}</span>
        <HighlightWord
          active={words1[index % words1.length]}
          squareCorner="tr"
        />
        <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-3">
          <HighlightWord
            active={words2[index % words2.length]}
            squareCorner="tl"
          />
          <span className="whitespace-nowrap">{suffix}</span>
        </span>
      </h1>
    </MotionConfig>
  )
}

function HighlightWord({
  active,
  squareCorner,
}: {
  active: string
  /** which corner to leave un-rounded, so the two boxes look like they interlock */
  squareCorner: 'tr' | 'tl'
}) {
  const cornerClass =
    squareCorner === 'tr'
      ? 'rounded-tl-xl rounded-br-xl rounded-bl-xl rounded-tr-none origin-top-right -rotate-1'
      : 'rounded-tr-xl rounded-br-xl rounded-bl-xl rounded-tl-none origin-top-left rotate-1'

  return (
    <span className="relative inline-grid align-middle">
      {/* Invisible copy reserves box width/height for the active word. */}
      <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-nowrap px-3 py-4">
        {active}
      </span>

      {/* background box: this is the only layer that tilts */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 border-2 border-ink bg-primary shadow-[5px_5px_0_0_var(--ink)] ${cornerClass}`}
      />

      {/* text layer: stays upright, clips the sliding word */}
      <span className="absolute inset-0 flex items-center justify-center overflow-hidden text-on-primary">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={active}
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            exit={{ y: '-110%', opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            className="absolute inset-0 flex items-center justify-center whitespace-nowrap"
          >
            {active}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  )
}
