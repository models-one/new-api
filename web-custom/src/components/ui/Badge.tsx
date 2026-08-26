import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

type BadgeTone = 'primary' | 'secondary' | 'success' | 'warning' | 'muted'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone
}

const toneClasses: Record<BadgeTone, string> = {
  primary: 'border-primary/25 bg-primary/10 text-primary',
  secondary: 'border-secondary/25 bg-secondary/10 text-secondary',
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  muted: 'border-border bg-surface-high text-muted',
}

export function Badge(props: BadgeProps) {
  const { className, tone = 'muted', ...badgeProps } = props

  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center rounded-[3px] border px-2 py-0.5 text-xs font-semibold',
        toneClasses[tone],
        className,
      )}
      {...badgeProps}
    />
  )
}
