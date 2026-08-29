import type { ReactNode } from 'react'

import { alignClasses, type DataTableAlign } from '@/components/data/table-meta'
import { toneTextClasses, type Tone } from '@/components/ui/tone'
import { cn } from '@/lib/utils'

type MonoCellProps = {
  /** Numbers, ids, secrets, model names and timestamps all belong here. */
  value?: string | number | null
  /** Overrides `value` when a cell needs its own markup. */
  children?: ReactNode
  align?: DataTableAlign
  tone?: Tone
  /** Shown when `value` is null, undefined or empty. */
  fallback?: string
  title?: string
  className?: string
}

/**
 * Applies `.mono` (tabular-nums). Mandatory for numeric columns so the column
 * width does not jitter while a page refetches.
 */
export function MonoCell(props: MonoCellProps) {
  const hasValue = props.value !== null && props.value !== undefined && props.value !== ''
  const fallback = props.fallback ?? '—'

  return (
    <span
      className={cn(
        'mono block',
        alignClasses[props.align ?? 'left'],
        props.tone ? toneTextClasses[props.tone] : '',
        props.className,
      )}
      title={props.title}
    >
      {props.children ?? (hasValue ? String(props.value) : fallback)}
    </span>
  )
}
