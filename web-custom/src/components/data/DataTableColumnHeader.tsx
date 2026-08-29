import ArrowDownIcon from 'lucide-react/dist/esm/icons/arrow-down'
import ArrowUpIcon from 'lucide-react/dist/esm/icons/arrow-up'
import ChevronsUpDownIcon from 'lucide-react/dist/esm/icons/chevrons-up-down'
import type { Column } from '@tanstack/react-table'

import { alignClasses, type DataTableAlign } from '@/components/data/table-meta'
import { cn } from '@/lib/utils'

type DataTableColumnHeaderProps<TData, TValue> = {
  column: Column<TData, TValue>
  /** Visible header text; it is also the sort button's accessible name. */
  title: string
  align?: DataTableAlign
  className?: string
}

const sortIcons = {
  none: ChevronsUpDownIcon,
  asc: ArrowUpIcon,
  desc: ArrowDownIcon,
}

/**
 * Tri-state sort control: none -> ascending -> descending -> none.
 *
 * The `aria-sort` attribute belongs on the `<th>` and is written by `DataTable`
 * from the same `column.getIsSorted()` value, because `DataTable` owns the cell
 * element. This component owns the button inside it.
 */
export function DataTableColumnHeader<TData, TValue>(props: DataTableColumnHeaderProps<TData, TValue>) {
  const align = props.align ?? props.column.columnDef.meta?.align ?? 'left'

  if (!props.column.getCanSort()) {
    return (
      <span className={cn('block font-semibold', alignClasses[align], props.className)}>{props.title}</span>
    )
  }

  const sorted = props.column.getIsSorted()
  const state = sorted === false ? 'none' : sorted
  const SortIcon = sortIcons[state]

  return (
    <button
      className={cn(
        'group inline-flex min-h-7 items-center gap-1.5 rounded-[4px] font-semibold transition-colors hover:text-foreground',
        state === 'none' ? 'text-muted' : 'text-foreground',
        align === 'right' ? 'flex-row-reverse' : '',
        props.className,
      )}
      onClick={props.column.getToggleSortingHandler()}
      type="button"
    >
      {props.title}
      <SortIcon
        aria-hidden="true"
        className={cn(
          'size-3.5 shrink-0',
          state === 'none' ? 'opacity-40 group-hover:opacity-80' : 'text-primary',
        )}
      />
    </button>
  )
}
