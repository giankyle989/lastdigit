import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import type { SearchParams } from '@/lib/table-params'
import { hrefWith } from '@/lib/url'
import { cn } from '@/lib/utils'

type Props = { basePath: string; params: SearchParams; page: number; pageCount: number }

export function Pagination({ basePath, params, page, pageCount }: Props) {
  if (pageCount <= 1) return null
  const link = (target: number, label: string, enabled: boolean) =>
    enabled ? (
      <Link
        href={hrefWith(basePath, params, { page: target })}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
      >
        {label}
      </Link>
    ) : (
      <span aria-disabled className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'opacity-40')}>
        {label}
      </span>
    )
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-2 pt-3 text-sm">
      {link(page - 1, 'Previous', page > 1)}
      <span className="text-muted-foreground">
        Page {page} of {pageCount}
      </span>
      {link(page + 1, 'Next', page < pageCount)}
    </nav>
  )
}
