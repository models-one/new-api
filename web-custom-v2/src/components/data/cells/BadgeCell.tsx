import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/Badge'
import type { Tone } from '@/components/ui/tone'
import { cn } from '@/lib/utils'

type BadgeCellProps = {
  label: string
  tone?: Tone
  /** Pass an icon element that already carries `aria-hidden="true"`. */
  icon?: ReactNode
  pill?: boolean
  size?: 'md' | 'sm'
  /** Adds `.mono` for status codes, ids and other fixed-width values. */
  mono?: boolean
  className?: string
}

export function BadgeCell(props: BadgeCellProps) {
  return (
    <Badge
      className={cn(props.mono ? 'mono' : '', props.className)}
      pill={props.pill}
      size={props.size}
      tone={props.tone}
    >
      {props.icon}
      {props.label}
    </Badge>
  )
}
