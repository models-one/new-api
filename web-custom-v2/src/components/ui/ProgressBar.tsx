import { useId } from 'react'

import { toneFillClasses, type Tone } from '@/components/ui/tone'
import { cn } from '@/lib/utils'

type ProgressBarSize = 'xs' | 'sm' | 'md'

type ProgressBarProps = {
  value: number
  max?: number
  tone?: Tone
  size?: ProgressBarSize
  /** Accessible name for the progressbar. Rendered visibly when `showValue` is set. */
  label: string
  /** Renders the label and the percentage above the track. */
  showValue?: boolean
  /** Human readable value ("432 of 1,000 USD"); falls back to a percentage. */
  valueText?: string
  indeterminate?: boolean
  className?: string
}

const sizeClasses: Record<ProgressBarSize, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
}

export function ProgressBar(props: ProgressBarProps) {
  const {
    value,
    max = 100,
    tone = 'primary',
    size = 'sm',
    label,
    showValue = false,
    valueText,
    indeterminate = false,
    className,
  } = props

  const labelId = useId()
  const safeMax = max > 0 ? max : 100
  const clamped = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), safeMax)
  const percent = Math.round((clamped / safeMax) * 100)

  return (
    <div className={cn('w-full', className)}>
      {showValue ? (
        <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
          <span className="text-muted" id={labelId}>
            {label}
          </span>
          <span className="mono text-foreground">{valueText ?? `${percent}%`}</span>
        </div>
      ) : null}

      <div
        aria-label={showValue ? undefined : label}
        aria-labelledby={showValue ? labelId : undefined}
        aria-valuemax={safeMax}
        aria-valuemin={0}
        aria-valuenow={indeterminate ? undefined : clamped}
        aria-valuetext={indeterminate ? undefined : (valueText ?? `${percent}%`)}
        className={cn('w-full overflow-hidden rounded-full bg-surface-high', sizeClasses[size])}
        role="progressbar"
      >
        <div
          className={cn(
            'h-full rounded-full',
            toneFillClasses[tone],
            indeterminate && 'progress-indeterminate',
          )}
          style={{ width: indeterminate ? '35%' : `${percent}%` }}
        />
      </div>
    </div>
  )
}
