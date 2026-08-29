import RotateCcwIcon from 'lucide-react/dist/esm/icons/rotate-ccw'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

type DataTableToolbarProps = {
  /** Names the region landmark, e.g. "Request log filters". Required. */
  label: string
  /** Search input slot — the field must carry its own label. */
  search?: ReactNode
  /** Filter controls; `aria-pressed` toggles belong here. */
  filters?: ReactNode
  /** Names the `role="group"` around the filters. Required when `filters` holds toggles. */
  filtersLabel?: string
  /** Right-hand slot for create/export style buttons. */
  actions?: ReactNode
  onReset?: () => void
  resetLabel?: string
  /** Reset stays in the tree and is disabled when nothing is filtered. */
  isResetDisabled?: boolean
  className?: string
}

export function DataTableToolbar(props: DataTableToolbarProps) {
  const { t } = useTranslation()
  const resetLabel = props.resetLabel ?? t('Reset filters')
  const filterGroupProps = props.filtersLabel
    ? { role: 'group' as const, 'aria-label': props.filtersLabel }
    : {}

  return (
    <section
      aria-label={props.label}
      className={cn(
        'flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between',
        props.className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        {props.search ? <div className="min-w-0 sm:w-full sm:max-w-sm">{props.search}</div> : null}
        {props.filters ? (
          <div className="flex flex-wrap items-center gap-2" {...filterGroupProps}>
            {props.filters}
          </div>
        ) : null}
      </div>

      {props.onReset || props.actions ? (
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {props.onReset ? (
            <Button disabled={props.isResetDisabled ?? false} onClick={props.onReset} variant="quiet">
              <RotateCcwIcon aria-hidden="true" />
              {resetLabel}
            </Button>
          ) : null}
          {props.actions}
        </div>
      ) : null}
    </section>
  )
}
