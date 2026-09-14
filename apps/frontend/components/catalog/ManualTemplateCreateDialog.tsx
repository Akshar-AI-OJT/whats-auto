'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import {
  api,
  type ApiError,
  type CreatePlatformTemplateCatalogBody,
  type PlatformTemplateCatalogItem,
} from '@/lib/api'
import { unwrapSingle } from '@/lib/api-unwrap'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_LANGUAGES,
} from '@/components/dashboard/templates/template-utils'

const emptyManual: CreatePlatformTemplateCatalogBody = {
  name: '',
  category: 'UTILITY',
  language: 'en_US',
  bodyText: '',
}

const selectClassName =
  'h-12 w-full rounded-md border border-ink bg-canvas px-4 text-base text-ink outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-primary/50'

export function ManualTemplateCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('catalog.templates.admin')
  const queryClient = useQueryClient()
  const [manual, setManual] = useState<CreatePlatformTemplateCatalogBody>(emptyManual)
  const [error, setError] = useState<string | null>(null)
  const formKey = open ? 'open' : 'closed'
  const [hydratedKey, setHydratedKey] = useState(formKey)
  if (formKey !== hydratedKey) {
    setHydratedKey(formKey)
    setManual(emptyManual)
    setError(null)
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.superAdmin.templateCatalog.create(manual)
      return unwrapSingle<PlatformTemplateCatalogItem>(data)
    },
    onSuccess: async () => {
      setError(null)
      onOpenChange(false)
      setManual(emptyManual)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'template-catalog'] })
    },
    onError: (err) => setError((err as unknown as ApiError).message),
  })

  function handleOpenChange(next: boolean) {
    if (createMutation.isPending) return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            createMutation.mutate()
          }}
        >
          <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
            <DialogTitle>{t('manualCreate')}</DialogTitle>
            <DialogDescription>{t('manual.subtitle')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(60vh,28rem)] space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="space-y-2">
              <label htmlFor="catalog-template-name" className="text-sm font-medium text-ink">
                {t('manual.name')}
              </label>
              <Input
                id="catalog-template-name"
                value={manual.name}
                onChange={(event) =>
                  setManual((current) => ({ ...current, name: event.target.value }))
                }
                placeholder={t('manual.name')}
                required
                disabled={createMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="catalog-template-category" className="text-sm font-medium text-ink">
                {t('manual.category')}
              </label>
              <select
                id="catalog-template-category"
                className={selectClassName}
                value={manual.category}
                disabled={createMutation.isPending}
                onChange={(event) =>
                  setManual((current) => ({ ...current, category: event.target.value }))
                }
              >
                {TEMPLATE_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="catalog-template-language" className="text-sm font-medium text-ink">
                {t('manual.language')}
              </label>
              <select
                id="catalog-template-language"
                className={selectClassName}
                value={manual.language}
                disabled={createMutation.isPending}
                onChange={(event) =>
                  setManual((current) => ({ ...current, language: event.target.value }))
                }
              >
                {TEMPLATE_LANGUAGES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label} ({item.value})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="catalog-template-body" className="text-sm font-medium text-ink">
                {t('manual.body')}
              </label>
              <textarea
                id="catalog-template-body"
                className="min-h-24 w-full rounded-md border border-ink bg-canvas px-4 py-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                value={manual.bodyText}
                onChange={(event) =>
                  setManual((current) => ({ ...current, bodyText: event.target.value }))
                }
                placeholder={t('manual.body')}
                required
                disabled={createMutation.isPending}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter className="flex-row justify-end gap-2 border-t border-dash-border sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={createMutation.isPending}
              onClick={() => handleOpenChange(false)}
            >
              {t('manual.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {t('manual.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
