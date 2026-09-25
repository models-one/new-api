import ChevronLeftIcon from 'lucide-react/dist/esm/icons/chevron-left'
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

type PaginationProps = {
  /** 1-based page number. */
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: readonly number[]
  /** Drops the numbered buttons and the page-size select. */
  compact?: boolean
  /** Accessible name for the emitted navigation landmark. */
  label?: string
  /** Accessible name for the page-size select. */
  pageSizeLabel?: string
  className?: string
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

/** Page numbers around the current page, with -1 marking an elided run. */
function pageWindow(page: number, pageCount: number): number[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_unused, index) => index + 1)
  const pages = new Set([1, pageCount, page, page - 1, page + 1])
  const visible = [...pages].filter((item) => item >= 1 && item <= pageCount).sort((a, b) => a - b)

  const withGaps: number[] = []
  let previous = 0
  for (const item of visible) {
    if (previous !== 0 && item - previous > 1) withGaps.push(-1)
    withGaps.push(item)
    previous = item
  }
  return withGaps
}

export function Pagination(props: PaginationProps) {
  const { t } = useTranslation()
  const selectId = useId()

  const {
    page,
    pageSize,
    total,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    compact = false,
    label = t('Pagination'),
    pageSizeLabel = t('Rows per page'),
    className,
  } = props

  const pageCount = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)))
  const currentPage = Math.min(Math.max(page, 1), pageCount)
  const previousLabel = t('Previous page')
  const nextLabel = t('Next page')

  return (
    <nav
      aria-label={label}
      className={cn('flex flex-wrap items-center justify-between gap-3', className)}
    >
      <div className="flex items-center gap-1">
        <Button
          aria-label={previousLabel}
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          size="icon-md"
          title={previousLabel}
          variant="quiet"
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>

        {compact ? (
          <span className="mono px-2 text-sm text-muted">
            {currentPage} / {pageCount}
          </span>
        ) : (
          pageWindow(currentPage, pageCount).map((item, index) =>
            item === -1 ? (
              <span aria-hidden="true" className="px-1 text-sm text-muted" key={`gap-${index}`}>
                …
              </span>
            ) : (
              <Button
                aria-current={item === currentPage ? 'page' : undefined}
                className="mono min-h-9 min-w-9 px-2"
                key={item}
                onClick={() => onPageChange(item)}
                size="sm"
                variant={item === currentPage ? 'outline' : 'quiet'}
              >
                {item}
              </Button>
            ),
          )
        )}

        <Button
          aria-label={nextLabel}
          disabled={currentPage >= pageCount}
          onClick={() => onPageChange(currentPage + 1)}
          size="icon-md"
          title={nextLabel}
          variant="quiet"
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>

      {!compact && onPageSizeChange ? (
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted" htmlFor={selectId}>
            {pageSizeLabel}
          </label>
          <select
            className="field mono px-3 text-sm"
            id={selectId}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            value={pageSize}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </nav>
  )
}
