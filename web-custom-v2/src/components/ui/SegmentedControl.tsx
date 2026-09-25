import { cn } from '@/lib/utils'

type SegmentedControlSize = 'sm' | 'md' | 'lg'

export type SegmentedControlOption<TValue extends string = string> = {
  id: TValue
  label: string
  count?: number
  disabled?: boolean
}

type SegmentedControlProps<TValue extends string = string> = {
  options: readonly SegmentedControlOption<TValue>[]
  value: TValue
  onChange: (value: TValue) => void
  /** Accessible name for the toggle group. Required — the group is announced as a whole. */
  label: string
  size?: SegmentedControlSize
  /** Stretch the segments to fill the container. */
  fullWidth?: boolean
  className?: string
}

// Heights are picked so the whole control (border + p-1 on both sides) matches the
// `.field` chrome of the same size: 34 / 42 / 48px. A segmented control and a select on
// one filter row have to share a baseline.
const sizeClasses: Record<SegmentedControlSize, string> = {
  sm: 'min-h-7 px-3 text-xs',
  md: 'min-h-8 px-4 text-sm',
  lg: 'min-h-10 px-4 text-sm',
}

export function SegmentedControl<TValue extends string = string>(
  props: SegmentedControlProps<TValue>,
) {
  const { options, value, onChange, label, size = 'md', fullWidth = false, className } = props

  return (
    <div
      aria-label={label}
      className={cn(
        // `max-w-full` plus a scrolling track is what keeps this control inside the page.
        // Without it the options simply keep their intrinsic width, push past the border
        // that is supposed to contain them, and drag the whole document into a sideways
        // scroll — four period options are already wider than a 390px phone.
        'inline-flex max-w-full items-center overflow-x-auto rounded-[var(--radius-panel)] border border-border bg-sunken p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        fullWidth && 'flex w-full',
        className,
      )}
      role="group"
    >
      {options.map((option) => {
        const selected = option.id === value
        return (
          <button
            aria-pressed={selected}
            className={cn(
              'flex items-center justify-center gap-2 whitespace-nowrap rounded-[4px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              sizeClasses[size],
              fullWidth ? 'flex-1' : 'flex-none',
              selected ? 'bg-surface-high text-primary' : 'text-muted hover:text-foreground',
            )}
            disabled={option.disabled}
            key={option.id}
            onClick={() => onChange(option.id)}
            type="button"
          >
            {option.label}
            {option.count === undefined ? null : (
              <span className="mono rounded-full bg-background/60 px-2 py-0.5 text-[10px] text-muted">
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
