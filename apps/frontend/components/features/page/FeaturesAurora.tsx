import { cn } from '@/lib/utils'

/** Soft aurora atmosphere matching Login/Register. */
export function FeaturesAurora({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        className
      )}
    >
      <div className="absolute inset-0 bg-[#F8FAFC]" />
      <div className="absolute top-0 left-1/3 size-[28rem] -translate-x-1/2 rounded-full bg-slate-200/40 blur-[110px]" />
      <div className="absolute right-0 bottom-0 size-[24rem] translate-x-1/5 rounded-full bg-slate-100 blur-[100px]" />
      <div className="absolute bottom-1/4 left-0 size-[18rem] rounded-full bg-primary/[0.08] blur-[90px]" />
      <div className="absolute top-1/3 right-1/4 size-[16rem] rounded-full bg-primary/10 blur-[100px]" />
    </div>
  )
}
