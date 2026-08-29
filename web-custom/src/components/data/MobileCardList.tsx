import { flexRender, type Cell, type Row, type Table } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableEmpty } from '@/components/data/DataTableEmpty'
import { alignClasses } from '@/components/data/table-meta'
import { cn } from '@/lib/utils'

type MobileCardListProps<TData> = {
  table: Table<TData>
  /** Names the region landmark, e.g. "Request log cards". Required. */
  label: string
  isLoading?: boolean
  isFetching?: boolean
  emptyTitle: string
  emptyDescription?: string
  /** Pass an icon element that already carries `aria-hidden="true"`. */
  emptyIcon?: ReactNode
  emptyAction?: ReactNode
  /** Replaces the default card body entirely. */
  renderCard?: (row: Row<TData>) => ReactNode
  /**
   * Turns the card title into a button. The primary column must not render
   * interactive content when this is set.
   */
  onRowClick?: (row: TData) => void
  rowKey?: (row: TData, index: number) => string
  renderExpandedRow?: (row: Row<TData>) => ReactNode
  loadingLabel?: string
  skeletonRows?: number
  className?: string
}

function cellLabel<TData>(cell: Cell<TData, unknown>): string {
  const meta = cell.column.columnDef.meta
  if (meta?.label) return meta.label
  const header = cell.column.columnDef.header
  return typeof header === 'string' ? header : cell.column.id
}

/**
 * The narrow-viewport rendering of the same rows and the same column
 * definitions. Compose it beside `DataTable` with the CSS breakpoint classes
 * (`md:hidden` here, `hidden md:block` on the table) — one component tree.
 */
export function MobileCardList<TData>(props: MobileCardListProps<TData>) {
  const { t } = useTranslation()
  const isLoading = props.isLoading ?? false
  const isFetching = props.isFetching ?? false
  const rows = props.table.getRowModel().rows
  const skeletonRows = props.skeletonRows ?? 3

  return (
    <section
      aria-busy={isLoading || isFetching}
      aria-label={props.label}
      className={cn('flex flex-col gap-3', props.className)}
    >
      <div aria-live="polite" className="sr-only" role="status">
        {isLoading || isFetching ? (props.loadingLabel ?? t('Loading results')) : ''}
      </div>

      {isLoading ? (
        <div aria-hidden="true" className="flex flex-col gap-3">
          {Array.from({ length: skeletonRows }, (_, index) => (
            <div className="panel-muted flex flex-col gap-3 p-4" key={index}>
              <span className="block h-4 w-32 animate-pulse rounded-[3px] bg-surface-high" />
              <span className="block h-3 w-full animate-pulse rounded-[3px] bg-surface-high" />
              <span className="block h-3 w-2/3 animate-pulse rounded-[3px] bg-surface-high" />
            </div>
          ))}
        </div>
      ) : null}

      {!isLoading && rows.length === 0 ? (
        <DataTableEmpty
          action={props.emptyAction}
          description={props.emptyDescription}
          icon={props.emptyIcon}
          title={props.emptyTitle}
        />
      ) : null}

      {!isLoading && rows.length > 0 ? (
        <ul className="flex flex-col gap-3" role="list">
          {rows.map((row) => {
            const cells = row.getVisibleCells().filter((cell) => !cell.column.columnDef.meta?.hideOnMobile)
            const primary = cells.find((cell) => cell.column.columnDef.meta?.mobilePrimary) ?? cells[0]
            const details = cells.filter((cell) => cell.id !== primary?.id)

            return (
              <li key={props.rowKey ? props.rowKey(row.original, row.index) : row.id}>
                <article
                  className={cn('panel-muted p-4', row.getIsSelected() ? 'border-primary/40' : '')}
                >
                  {props.renderCard ? (
                    props.renderCard(row)
                  ) : (
                    <>
                      {primary ? (
                        <div className="min-w-0 text-sm font-bold text-foreground">
                          {props.onRowClick ? (
                            <button
                              className="block w-full min-h-9 text-left"
                              onClick={() => props.onRowClick?.(row.original)}
                              type="button"
                            >
                              {flexRender(primary.column.columnDef.cell, primary.getContext())}
                            </button>
                          ) : (
                            flexRender(primary.column.columnDef.cell, primary.getContext())
                          )}
                        </div>
                      ) : null}

                      {details.length > 0 ? (
                        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                          {details.map((cell) => (
                            <div className="min-w-0" key={cell.id}>
                              <dt className="eyebrow">{cellLabel(cell)}</dt>
                              <dd
                                className={cn(
                                  'mt-1 text-sm text-foreground',
                                  alignClasses[cell.column.columnDef.meta?.align ?? 'left'],
                                  cell.column.columnDef.meta?.mono ? 'mono' : '',
                                )}
                              >
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </>
                  )}

                  {props.renderExpandedRow && row.getIsExpanded() ? (
                    <div className="mt-4 border-t border-border pt-4">{props.renderExpandedRow(row)}</div>
                  ) : null}
                </article>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
