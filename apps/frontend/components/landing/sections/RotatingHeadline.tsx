'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface RotatingHeadlineProps {
  prefix: string
  words1: string[]
  words2: string[]
  suffix: string
  /** ms between word-pair swaps */
  interval?: number
}

/**
 * "The #1 [word1] [word2] platform" with word1/word2 rotating together
 * in sync, each inside a highlighted pill, sliding vertically.
 */
export function RotatingHeadline({
  prefix,
  words1,
  words2,
  suffix,
  interval = 3600,
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
    <h1 className="flex flex-wrap items-center gap-x-3 gap-y-3 text-3xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
      <span>{prefix}</span>
      <HighlightWord word={words1[index % words1.length]} />
      <span className="flex items-center gap-3">
        <HighlightWord word={words2[index % words2.length]} />
        <span>{suffix}</span>
      </span>
    </h1>
  )
}

function HighlightWord({ word }: { word: string }) {
  return (
    <span
      className="relative inline-block overflow-hidden rounded-lg border-2 border-foreground
                 bg-primary px-3 py-3.5 align-middle text-primary-foreground
                 shadow-[4px_4px_0_0_var(--foreground)]"
    >
      {/* invisible copy reserves box width/height so layout doesn't jump */}
      <span className="invisible" aria-hidden>
        {word}
      </span>

      <AnimatePresence mode="popLayout">
        <motion.span
          key={word}
          initial={{ y: '110%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '-110%', opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {word}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
