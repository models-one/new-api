import type { ReactNode } from 'react'

import { toneSurfaceClasses, type Tone } from '@/components/ui/tone'
import { cn } from '@/lib/utils'

type IconBadgeSize = 'sm' | 'md' | 'lg'
type IconBadgeShape = 'square' | 'circle'

type IconBadgeProps = {
  icon: ReactNode
  tone?: Tone
  size?: IconBadgeSize
  shape?: IconBadgeShape
  /** Supply only when the badge carries meaning on its own; otherwise it stays decorative. */
  label?: string
  className?: string
}

const sizeClasses: Record<IconBadgeSize, string> = {
  sm: 'size-9 [&_svg]:size-4',
  md: 'size-11 [&_svg]:size-5',
  lg: 'size-14 [&_svg]:size-6',
}

export function IconBadge(props: IconBadgeProps) {
  const { icon, tone = 'muted', size = 'md', shape = 'square', label, className } = props

  const semantics = label
    ? ({ 'aria-label': label, role: 'img' } as const)
    : ({ 'aria-hidden': true } as const)

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center border',
        shape === 'circle' ? 'rounded-full' : 'rounded-[4px]',
        sizeClasses[size],
        toneSurfaceClasses[tone],
        className,
      )}
      {...semantics}
    >
      {icon}
    </span>
  )
}
