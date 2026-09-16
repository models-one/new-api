import { flexRender, type Row, type Table } from '@tanstack/react-table'
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableEmpty } from '@/components/data/DataTableEmpty'
import { DataTableSkeleton } from '@/components/data/DataTableSkeleton'
import { alignClasses, stickyRightClasses } from '@/components/data/table-meta'
import type { DataTableColumns } from '@/components/data/use-data-table'
import { cn } from '@/lib/utils'

type DataTableProps<TData> = {
  table: Table<TData>
  /** Becomes the table's accessible name. Required. */
  label: string
  /**
   * Only used as a skeleton fallback; the live column count comes from the
   * table instance so hidden columns are honoured.
   */
  columns?: DataTableColumns<TData>
  /** First load: the body renders skeleton rows instead of data. */
  isLoading?: boolean
  /** Background refetch: the table is marked `aria-busy`, rows stay visible. */
  isFetching?: boolean
  emptyTitle: string
  emptyDescription?: string
  /** Pass an icon element that already carries `aria-hidden="true"`. */
  emptyIcon?: ReactNode
  emptyAction?: ReactNode
  /** Defaults to the TanStack row id (see `getRowId` on the hook). */
  rowKey?: (row: TData, index: number) => string
  onRowClick?: (row: TData) => void
  /** Rendered in a full-width row underneath rows where `row.getIsExpanded()`. */
  renderExpandedRow?: (row: Row<TData>) => ReactNode
  /** Announced in the `role="status"` region while loading. */
  loadingLabel?: string
  skeletonRows?: number
  /** e.g. `min-w-[860px]` when the columns need horizontal scrolling. */
  minWidthClassName?: string
  className?: string
}

const ariaSortValues = {
  asc: 'ascending',
  desc: 'descending',
  none: 'none',
} as const

/**
 * The frozen table chrome. All markup and ARIA live here; `@tanstack/react-table`
 * only supplies headless state through the `table` instance.
 */
export function DataTable<TData>(props: DataTableProps<TData>) {
  const { t } = useTranslation()
  const isLoading = props.isLoading ?? false
  const isFetching = props.isFetching ?? false
  const rows = props.table.getRowModel().rows
  const columnCount = props.table.getVisibleLeafColumns().length || props.columns?.length || 1
  const isEmpty = !isLoading && rows.length === 0

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrollableRight, setScrollableRight] = useState(false)

  // Several of these tables are wider than the window they live in. macOS overlay
  // scrollbars stay hidden until something scrolls, so the only sign that columns
  // continue past the edge would be the columns themselves being cut — which reads as a
  // rendering bug. The fade says "there is more this way".
  useEffect(() => {
    const node = scrollRef.current
    if (node === null) return
    const update = () => {
      setScrollableRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 1)
    }
    update()
    node.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => {
      node.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [rows.length, columnCount])

  // The empty state sits outside the scrolling table on purpose. Rendered as a spanning
  // cell it inherits the table's min-width, so on a phone a 1180px-wide "nothing here"
  // block centres its text off-screen and leaves a header row over an empty box.
  if (isEmpty) {
    return (
      <div className={cn('relative', props.className)}>
        <DataTableEmpty
          action={props.emptyAction}
          description={props.emptyDescription}
          icon={props.emptyIcon}
          title={props.emptyTitle}
        />
      </div>
    )
  }

  return (
    <div className={cn('relative', props.className)}>
      <div aria-live="polite" className="sr-only" role="status">
        {isLoading || isFetching ? (props.loadingLabel ?? t('Loading results')) : ''}
      </div>

      <div className="overflow-x-auto" ref={scrollRef}>
        <table
          aria-busy={isLoading || isFetching}
          aria-label={props.label}
          className={cn('w-full border-collapse text-left text-sm', props.minWidthClassName)}
        >
          {/* Tracked uppercase, the way the design reference sets every column header.
              Button labels stay sentence case: the reference is inconsistent about those
              and this console's are full phrases, which uppercase makes harder to read. */}
          <thead className="bg-surface-raised text-[0.7rem] tracking-[0.08em] text-muted uppercase">
            {props.table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta
                  const sorted = header.column.getIsSorted()
                  return (
                    <th
                      aria-sort={
                        header.column.getCanSort()
                          ? ariaSortValues[sorted === false ? 'none' : sorted]
                          : undefined
                      }
                      className={cn(
                        'px-5 py-3 font-semibold',
                        alignClasses[meta?.align ?? 'left'],
                        meta?.sticky === 'right' && cn(stickyRightClasses, 'bg-surface-raised before:from-surface-raised'),
                        meta?.headerClassName,
                      )}
                      colSpan={header.colSpan}
                      key={header.id}
                      scope="col"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {isLoading ? (
              <DataTableSkeleton columnCount={columnCount} rowCount={props.skeletonRows} />
            ) : null}

            {isLoading
              ? null
              : rows.map((row) => (
                <Fragment key={props.rowKey ? props.rowKey(row.original, row.index) : row.id}>
                  <tr
                    className={cn(
                      'border-t border-border transition-colors',
                      row.getIsSelected() ? 'bg-surface-high/40' : '',
                      props.onRowClick ? 'cursor-pointer hover:bg-surface-high/30' : '',
                    )}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    onClick={props.onRowClick ? () => props.onRowClick?.(row.original) : undefined}
                    onKeyDown={
                      props.onRowClick
                        ? (event: KeyboardEvent<HTMLTableRowElement>) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          props.onRowClick?.(row.original)
                        }
                        : undefined
                    }
                    tabIndex={props.onRowClick ? 0 : undefined}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta
                      return (
                        <td
                          className={cn(
                            'px-5 py-4',
                            alignClasses[meta?.align ?? 'left'],
                            meta?.mono ? 'mono' : '',
                            meta?.sticky === 'right' && cn(stickyRightClasses, 'bg-surface before:from-surface'),
                            meta?.cellClassName,
                          )}
                          key={cell.id}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      )
                    })}
                  </tr>

                  {props.renderExpandedRow && row.getIsExpanded() ? (
                    <tr className="border-t border-border bg-canvas/60">
                      <td className="px-5 py-4" colSpan={columnCount}>
                        {props.renderExpandedRow(row)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
          </tbody>
        </table>
      </div>
      {scrollableRight ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent"
        />
      ) : null}
    </div>
  )
}
