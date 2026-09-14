'use client'

import { createElement, type ComponentProps } from 'react'
import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'
import { cn } from '@/lib/utils'

const { Link: IntlLink, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)

export function Link({ className, ...props }: ComponentProps<typeof IntlLink>) {
  return createElement(IntlLink, {
    ...props,
    className: cn('cursor-pointer', className),
  })
}

export { redirect, usePathname, useRouter, getPathname }
