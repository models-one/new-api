import type { HTMLAttributes, ReactNode } from 'react'

import { Badge } from '@/components/ui/Badge'
import { toneFillClasses, type Tone } from '@/components/ui/tone'
import { cn } from '@/lib/utils'

type StatusBadgeSize = 'md' | 'sm'

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone
  /** Leading status dot. */
  dot?: boolean
  /** Animate the dot for live/in-progress states. */
  pulse?: boolean
  size?: StatusBadgeSize
  pill?: boolean
  children: ReactNode
}

/**
 * new-api stores entity status as a small integer.
 * 1 enabled, 2 manually disabled, 3 expired, 4 quota exhausted.
 */
export function statusToTone(status: number): Tone {
  if (status === 1) return 'success'
  if (status === 2) return 'muted'
  if (status === 3) return 'warning'
  if (status === 4) return 'destructive'
  return 'muted'
}

export function StatusBadge(props: StatusBadgeProps) {
  const {
    tone = 'muted',
    dot = true,
    pulse = false,
    size = 'md',
    pill = true,
    children,
    className,
    ...badgeProps
  } = props

  return (
    <Badge className={className} pill={pill} size={size} tone={tone} {...badgeProps}>
      {dot ? (
        <span
          aria-hidden="true"
          className={cn(
            'inline-block shrink-0 rounded-full',
            size === 'sm' ? 'size-1.5' : 'size-2',
            toneFillClasses[tone],
            pulse && 'animate-pulse',
          )}
        />
      ) : null}
      {children}
    </Badge>
  )
}
