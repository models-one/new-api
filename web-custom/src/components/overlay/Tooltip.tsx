import { Tooltip as BaseTooltip, type TooltipPositionerProps } from '@base-ui/react/tooltip'
import type { ReactElement, ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type TooltipSide = NonNullable<TooltipPositionerProps['side']>
export type TooltipAlign = NonNullable<TooltipPositionerProps['align']>

type TooltipProps = {
  /** Visual-only tooltip body. It is NOT the trigger's accessible name. */
  content: ReactNode
  /**
   * The element the tooltip is attached to. It is merged into the Base UI trigger
   * via `render`, so the element stays the only rendered control and keeps its own
   * `aria-label` / `title`.
   */
  children: ReactElement
  side?: TooltipSide
  align?: TooltipAlign
  sideOffset?: number
  /** Hover dwell before the tooltip opens, in ms. */
  delay?: number
  /** Suppresses the tooltip without removing the trigger from the tree. */
  disabled?: boolean
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Extra classes for the tooltip surface. */
  className?: string
}

export function Tooltip(props: TooltipProps) {
  const {
    content,
    children,
    side = 'top',
    align = 'center',
    sideOffset = 6,
    delay,
    disabled = false,
    open,
    defaultOpen,
    onOpenChange,
    className,
  } = props

  return (
    <BaseTooltip.Root
      defaultOpen={defaultOpen}
      disabled={disabled}
      onOpenChange={onOpenChange}
      open={open}
    >
      <BaseTooltip.Trigger delay={delay} render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner
          align={align}
          className="z-[95] outline-none"
          side={side}
          sideOffset={sideOffset}
        >
          {/*
            aria-hidden is deliberate. Every icon button in this codebase already
            carries aria-label + title, and tests query getByRole('button', { name }).
            Base UI's tooltip adds no aria-describedby of its own, so hiding the panel
            keeps the trigger's name exactly as authored and stops the tooltip text
            from being announced a second time.
          */}
          <BaseTooltip.Popup
            aria-hidden="true"
            className={cn(
              'panel max-w-[min(18rem,calc(100vw-2rem))] px-2.5 py-1.5 text-xs font-medium leading-5 text-foreground outline-none',
              className,
            )}
          >
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  )
}
