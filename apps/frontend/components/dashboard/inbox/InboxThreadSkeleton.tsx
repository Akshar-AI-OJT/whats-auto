'use client'

import { cn } from '@/lib/utils'

function Shimmer({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-dash-border', className)} />
}

export function InboxThreadHeaderSkeleton() {
  return (
    <div className="flex items-start gap-3 border-b border-dash-border px-4 py-4 sm:px-5">
      <Shimmer className="size-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Shimmer className="h-5 w-40" />
        <Shimmer className="h-3.5 w-56" />
        <div className="flex gap-2 pt-1">
          <Shimmer className="h-5 w-16 rounded-md" />
          <Shimmer className="h-5 w-24 rounded-md" />
        </div>
      </div>
    </div>
  )
}

export function InboxThreadMessagesSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:px-5">
      <div className="flex justify-start">
        <Shimmer className="h-16 w-[min(72%,20rem)] rounded-2xl rounded-tl-md" />
      </div>
      <div className="flex justify-end">
        <Shimmer className="h-14 w-[min(68%,18rem)] rounded-2xl rounded-tr-md" />
      </div>
      <div className="flex justify-start">
        <Shimmer className="h-20 w-[min(75%,22rem)] rounded-2xl rounded-tl-md" />
      </div>
      <div className="flex justify-end">
        <Shimmer className="h-12 w-[min(55%,14rem)] rounded-2xl rounded-tr-md" />
      </div>
    </div>
  )
}
