import { Popover as BasePopover, type PopoverPositionerProps } from '@base-ui/react/popover'
import { isValidElement, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type PopoverSide = NonNullable<PopoverPositionerProps['side']>
export type PopoverAlign = NonNullable<PopoverPositionerProps['align']>

type PopoverProps = {
  /**
   * Accessible name for the popover surface. Base UI renders the popup with
   * `role="dialog"`, which is nameless unless we supply one, so this is required.
   */
  label: string
  /**
   * The element that opens the popover. A React element is merged into the
   * Base UI trigger (no nested `<button>`), so an icon Button keeps its own
   * `aria-label` / `title` and stays a single `getByRole('button')` match.
   * Anything else (a string, a fragment) is wrapped in a default styled button.
   */
  trigger: ReactNode
  children: ReactNode
  side?: PopoverSide
  align?: PopoverAlign
  sideOffset?: number
  /**
   * `true` locks page scroll and blocks outside pointer interaction,
   * `'trap-focus'` only traps focus.
   */
  modal?: boolean | 'trap-focus'
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Extra classes for the popup surface. */
  className?: string
  /** Extra classes for the fallback trigger button (ignored when `trigger` is an element). */
  triggerClassName?: string
  /** Keep the popup in the DOM while closed so CSS exit transitions can run. */
  keepMounted?: boolean
}

const fallbackTriggerClasses =
  'inline-flex min-h-9 items-center justify-center gap-2 rounded-[4px] border border-border bg-surface-high/40 px-3 text-sm font-semibold text-foreground transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:text-muted [&_svg]:size-4 [&_svg]:shrink-0'

export function Popover(props: PopoverProps) {
  const {
    label,
    trigger,
    children,
    side = 'bottom',
    align = 'center',
    sideOffset = 8,
    modal = false,
    open,
    defaultOpen,
    onOpenChange,
    className,
    triggerClassName,
    keepMounted = false,
  } = props

  return (
    <BasePopover.Root
      defaultOpen={defaultOpen}
      modal={modal}
      onOpenChange={onOpenChange}
      open={open}
    >
      {isValidElement(trigger) ? (
        <BasePopover.Trigger render={trigger} />
      ) : (
        <BasePopover.Trigger className={cn(fallbackTriggerClasses, triggerClassName)}>
          {trigger}
        </BasePopover.Trigger>
      )}
      <BasePopover.Portal keepMounted={keepMounted}>
        <BasePopover.Positioner
          align={align}
          className="z-[85] outline-none"
          side={side}
          sideOffset={sideOffset}
        >
          <BasePopover.Popup
            aria-label={label}
            className={cn(
              'panel max-h-[min(28rem,calc(100vh-6rem))] min-w-[13rem] max-w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-4 text-sm text-foreground outline-none',
              className,
            )}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  )
}
