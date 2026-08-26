import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

type PanelProps = HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'section' | 'div'
  muted?: boolean
}

export function Panel(props: PanelProps) {
  const { as: Component = 'section', className, muted = false, ...panelProps } = props

  return (
    <Component
      className={cn(muted ? 'panel-muted' : 'panel', className)}
      {...panelProps}
    />
  )
}
