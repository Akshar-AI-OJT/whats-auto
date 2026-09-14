import { Button } from '@/components/ui/button'

export function CatalogPager({
  prevLabel,
  nextLabel,
  pageLabel,
  prevDisabled,
  nextDisabled,
  onPrev,
  onNext,
}: {
  prevLabel: string
  nextLabel: string
  pageLabel?: string
  prevDisabled: boolean
  nextDisabled: boolean
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
      {pageLabel ? <p className="mr-auto text-sm text-mute">{pageLabel}</p> : null}
      <Button type="button" variant="outline" size="sm" disabled={prevDisabled} onClick={onPrev}>
        {prevLabel}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={nextDisabled} onClick={onNext}>
        {nextLabel}
      </Button>
    </div>
  )
}
