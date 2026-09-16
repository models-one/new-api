import ChevronLeftIcon from 'lucide-react/dist/esm/icons/chevron-left'
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { NativeSelect } from '@/components/form/NativeSelect'
import { Button } from '@/components/ui/Button'
import type { DataTablePaginationControls } from '@/components/data/use-data-table'
import { cn } from '@/lib/utils'

type DataTablePaginationProps = DataTablePaginationControls & {
  /** Names the navigation landmark, e.g. "Request log pages". Required. */
  label: string
  pageSizeOptions?: number[]
  /** Hide the rows-per-page control when the page size is fixed by the route. */
  showPageSize?: boolean
  isFetching?: boolean
  className?: string
}

const defaultPageSizeOptions = [10, 20, 50, 100]

/**
 * Server pagination controls for a 1-based `p` / `page_size` API.
 *
 * NOTE: this duplicates what a `ui/Pagination` primitive would own — no such
 * primitive existed when this cluster was written. If one lands, replace the
 * two buttons plus the page indicator with it and keep this component as the
 * server-state adapter.
 */
export function DataTablePagination(props: DataTablePaginationProps) {
  const { t } = useTranslation()
  const pageSizeLabelId = useId()
  const pageSizeOptions = props.pageSizeOptions ?? defaultPageSizeOptions
  const showPageSize = props.showPageSize ?? true
  const pageCount = Math.max(1, props.pageCount)
  const from = props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1
  const to = Math.min(props.page * props.pageSize, props.total)

  return (
    <nav
      aria-busy={props.isFetching ?? false}
      aria-label={props.label}
      className={cn(
        'flex flex-col gap-3 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between',
        props.className,
      )}
    >
      <p className="mono text-xs text-muted">
        {t('Showing {{from}}-{{to}} of {{total}}', { from, to, total: props.total })}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {showPageSize ? (
          <div className="flex items-center gap-2 text-xs text-muted">
            <span id={pageSizeLabelId}>{t('Rows per page')}</span>
            <NativeSelect
              aria-labelledby={pageSizeLabelId}
              hideLabel
              label={t('Rows per page')}
              onChange={(event) => props.onPageSizeChange(Number(event.target.value))}
              options={pageSizeOptions.map((option) => ({
                label: String(option),
                value: String(option),
              }))}
              selectClassName="mono w-[5.5rem]"
              size="sm"
              value={String(props.pageSize)}
            />
          </div>
        ) : null}

        {/* The three page controls stay one unit: when the row wraps on a phone, the
            next-page arrow must not end up alone on a line of its own. */}
        <div className="flex shrink-0 items-center gap-2">
        <Button
          aria-label={t('Previous page')}
          disabled={props.page <= 1}
          onClick={() => props.onPageChange(props.page - 1)}
          size="icon-md"
          title={t('Previous page')}
          variant="quiet"
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>

        <span className="mono min-w-24 text-center text-xs text-muted">
          {t('Page {{page}} of {{pageCount}}', { page: props.page, pageCount })}
        </span>

        <Button
          aria-label={t('Next page')}
          disabled={props.page >= pageCount}
          onClick={() => props.onPageChange(props.page + 1)}
          size="icon-md"
          title={t('Next page')}
          variant="quiet"
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
        </div>
      </div>
    </nav>
  )
}
