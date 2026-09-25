import type { HTMLAttributes } from 'react'

import { toneSurfaceClasses, type Tone } from '@/components/ui/tone'
import { cn } from '@/lib/utils'

type BadgeSize = 'md' | 'sm'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone
  size?: BadgeSize
  pill?: boolean
}

const sizeClasses: Record<BadgeSize, string> = {
  md: 'min-h-6 px-2 py-0.5 text-xs',
  sm: 'min-h-5 px-1.5 py-0 text-[0.6875rem]',
}

export function Badge(props: BadgeProps) {
  const { className, tone = 'muted', size = 'md', pill = false, ...badgeProps } = props

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border font-semibold',
        pill ? 'rounded-full' : 'rounded-[3px]',
        sizeClasses[size],
        toneSurfaceClasses[tone],
        className,
      )}
      {...badgeProps}
    />
  )
}
