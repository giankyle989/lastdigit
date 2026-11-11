import { ArrowDown, ArrowUp } from 'lucide-react'
import Link from 'next/link'

import { Pagination } from '@/components/pagination'
import { type SearchParams, toggleSort } from '@/lib/table-params'
import { hrefWith } from '@/lib/url'
import { cn } from '@/lib/utils'

export type Column<T> = {
  key: string
  header: string
  /** Whitelisted sort field for this column, if sortable. */
  sort?: string
  align?: 'right'
  cell: (row: T) => React.ReactNode
}

type Props<T> = {
  basePath: string
  params: SearchParams
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** Makes the whole row a link (e.g. `?player=<id>`); `label` is the link text in the first cell. */
  rowLink?: (row: T) => { href: string; label: string }
  rowClassName?: (row: T) => string | undefined
  /** Current sort as in the URL (`field` / `-field`). */
  sort: string
  page: number
  pageCount: number
  total: number
  empty: string
  footer?: React.ReactNode
}

/** Server-driven table: sort links, row links and pagination are plain URLs (spec §5.2). */
export function DataTable<T>(p: Props<T>) {
  return (
    <div className="bg-card border-border rounded-xl border">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-border border-b">
              {p.columns.map((c) => {
                const active = c.sort !== undefined && p.sort.replace(/^-/, '') === c.sort
                const desc = p.sort.startsWith('-')
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (desc ? 'descending' : 'ascending') : undefined}
                    className={cn(
                      'text-muted-foreground px-3 py-2 font-medium whitespace-nowrap',
                      c.align === 'right' && 'text-right',
                    )}
                  >
                    {c.sort ? (
                      <Link
                        href={hrefWith(p.basePath, p.params, {
                          sort: toggleSort(p.sort, c.sort),
                          page: undefined,
                        })}
                        className="hover:text-foreground inline-flex items-center gap-1"
                      >
                        {c.header}
                        {active &&
                          (desc ? (
                            <ArrowDown aria-hidden className="size-3" />
                          ) : (
                            <ArrowUp aria-hidden className="size-3" />
                          ))}
                      </Link>
                    ) : (
                      c.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {p.rows.map((row) => {
              const link = p.rowLink?.(row)
              return (
                <tr
                  key={p.rowKey(row)}
                  className={cn(
                    'border-border hover:bg-surface-2 relative border-b last:border-b-0',
                    p.rowClassName?.(row),
                  )}
                >
                  {p.columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={cn('px-3 py-2 whitespace-nowrap', c.align === 'right' && 'num text-right')}
                    >
                      {i === 0 && link ? (
                        <Link
                          href={link.href}
                          scroll={false}
                          className="font-medium after:absolute after:inset-0"
                        >
                          {link.label}
                        </Link>
                      ) : (
                        c.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
          {p.footer && <tfoot className="border-border border-t font-semibold">{p.footer}</tfoot>}
        </table>
      </div>
      {p.rows.length === 0 && <p className="text-muted-foreground p-6 text-center text-sm">{p.empty}</p>}
      <div className="border-border flex items-center justify-between gap-2 border-t px-3 py-2">
        <span className="text-muted-foreground text-xs">
          {p.total} {p.total === 1 ? 'row' : 'rows'}
        </span>
        <Pagination basePath={p.basePath} params={p.params} page={p.page} pageCount={p.pageCount} />
      </div>
    </div>
  )
}
