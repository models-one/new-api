import { cn } from '@/lib/utils'

type DataTableSkeletonProps = {
  /** Must match the table's visible leaf column count. */
  columnCount: number
  rowCount?: number
  className?: string
}

/** Deterministic widths so the placeholder does not reshuffle between renders. */
const barWidths = ['w-24', 'w-32', 'w-16', 'w-40', 'w-20', 'w-28']

/**
 * Loading rows for a table body. The rows are decorative — `DataTable` renders
 * the `role="status"` announcement next to the table.
 */
export function DataTableSkeleton(props: DataTableSkeletonProps) {
  const rowCount = props.rowCount ?? 5
  const columns = Array.from({ length: Math.max(1, props.columnCount) }, (_, index) => index)

  return (
    <>
      {Array.from({ length: Math.max(1, rowCount) }, (_, rowIndex) => (
        <tr aria-hidden="true" className={cn('border-t border-border', props.className)} key={rowIndex}>
          {columns.map((columnIndex) => (
            <td className="px-5 py-4" key={columnIndex}>
              <span
                className={cn(
                  'block h-3 animate-pulse rounded-[3px] bg-surface-high',
                  barWidths[(rowIndex + columnIndex) % barWidths.length],
                )}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
