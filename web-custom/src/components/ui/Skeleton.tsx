import type { CSSProperties, HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

type SkeletonVariant = 'text' | 'block' | 'circle'

type SkeletonProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  variant?: SkeletonVariant
  /** Number of bars rendered by the `text` variant. */
  lines?: number
  width?: number | string
  height?: number | string
  /**
   * When present the placeholder becomes an announced loading region.
   * Leave it out for placeholders that sit inside an existing `role="status"`.
   */
  label?: string
}

const variantClasses: Record<SkeletonVariant, string> = {
  text: 'h-3 rounded-[3px]',
  block: 'rounded-[4px]',
  circle: 'aspect-square rounded-full',
}

function toLength(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined
  return typeof value === 'number' ? `${value}px` : value
}

export function Skeleton(props: SkeletonProps) {
  const {
    className,
    variant = 'text',
    lines = 1,
    width,
    height,
    label,
    style,
    ...skeletonProps
  } = props

  const barClassName = cn('animate-pulse bg-surface-high', variantClasses[variant], className)
  const barStyle: CSSProperties = {
    width: toLength(width),
    height: toLength(height) ?? (variant === 'block' ? '1rem' : undefined),
    ...style,
  }

  const regionProps = label
    ? ({ 'aria-busy': true, role: 'status' } as const)
    : ({ 'aria-hidden': true } as const)

  if (variant === 'text' && lines > 1) {
    return (
      <div className="flex flex-col gap-2" {...regionProps} {...skeletonProps}>
        {Array.from({ length: lines }, (_unused, index) => (
          <div
            className={barClassName}
            key={index}
            style={{ ...barStyle, width: index === lines - 1 ? '60%' : barStyle.width }}
          />
        ))}
        {label ? <span className="sr-only">{label}</span> : null}
      </div>
    )
  }

  return (
    <div className={barClassName} style={barStyle} {...regionProps} {...skeletonProps}>
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  )
}
