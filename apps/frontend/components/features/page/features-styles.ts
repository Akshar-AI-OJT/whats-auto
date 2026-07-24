import { cn } from '@/lib/utils'

export const featuresCardShell = cn(
  'rounded-[28px] border border-[#E2E8F0] bg-canvas',
  'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_16px_40px_rgb(15_23_42/0.06)]'
)

export const featuresPrimaryBtn = cn(
  'rounded-xl border-transparent bg-primary text-on-primary',
  'shadow-[0_1px_2px_rgb(14_15_12/0.06),0_8px_18px_rgb(159_232_112/0.4)]',
  'transition-[transform,box-shadow,background] duration-200',
  'hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-primary-active',
  'hover:shadow-[0_2px_4px_rgb(14_15_12/0.06),0_14px_28px_rgb(159_232_112/0.5)]',
  'active:translate-y-0 active:scale-100'
)

export const featuresOutlineBtn = cn(
  'rounded-xl border-[#E2E8F0] bg-canvas',
  'transition-[transform,background-color,border-color,box-shadow] duration-200',
  'hover:-translate-y-0.5 hover:scale-[1.02] hover:border-[#CBD5E1] hover:shadow-sm',
  'active:translate-y-0 active:scale-100'
)
