import { Menu, type MenuPositionerProps } from '@base-ui/react/menu'
import { Fragment, isValidElement, type ReactNode } from 'react'

import { toneTextClasses } from '@/components/ui/tone'
import { cn } from '@/lib/utils'

export type DropdownMenuSide = NonNullable<MenuPositionerProps['side']>
export type DropdownMenuAlign = NonNullable<MenuPositionerProps['align']>

export type DropdownMenuItem = {
  id: string
  label: string
  /** Decorative glyph. It is wrapped in an `aria-hidden` span, so no extra props are needed. */
  icon?: ReactNode
  /** Renders the row in the destructive tone (delete, revoke, disable...). */
  destructive?: boolean
  disabled?: boolean
  /** Draws a `role="separator"` rule above this row. */
  separatorBefore?: boolean
  /** Trailing hint: a shortcut, a count, a status. Rendered muted and right-aligned. */
  hint?: ReactNode
  onSelect?: () => void
}

type DropdownMenuItemTone = 'default' | 'destructive'

/**
 * Row chrome for menu items. Exported so custom `children` compositions built on
 * `Menu.Item` from '@base-ui/react/menu' can match the items rendered from `items`.
 */
export const dropdownMenuItemClasses =
  'flex min-h-9 w-full cursor-default select-none items-center gap-2.5 rounded-[4px] px-3 py-1.5 text-left text-sm outline-none transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50'

const itemToneClasses: Record<DropdownMenuItemTone, string> = {
  default: 'text-foreground data-[highlighted]:bg-surface-high',
  destructive: cn(toneTextClasses.destructive, 'data-[highlighted]:bg-destructive/10'),
}

const fallbackTriggerClasses =
  'inline-flex min-h-9 items-center justify-center gap-2 rounded-[4px] border border-border bg-surface-high/40 px-3 text-sm font-semibold text-foreground transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:text-muted [&_svg]:size-4 [&_svg]:shrink-0'

type DropdownMenuProps = {
  /**
   * The element that opens the menu. A React element is merged into the Base UI
   * trigger (no nested `<button>`), so an icon Button keeps its own `aria-label`
   * and `title` and remains a single `getByRole('button', { name })` match.
   */
  trigger: ReactNode
  /** Declarative rows. Omit and pass `children` for custom composition. */
  items?: DropdownMenuItem[]
  /** Custom menu content, rendered inside the popup instead of / after `items`. */
  children?: ReactNode
  /**
   * Accessible name for the `role="menu"` popup. Optional: Base UI already points
   * `aria-labelledby` at the trigger, so pass this only to override that name.
   */
  label?: string
  side?: DropdownMenuSide
  align?: DropdownMenuAlign
  sideOffset?: number
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Defaults to `false` so a row-action menu never scroll-locks a long table. */
  modal?: boolean
  disabled?: boolean
  /** Extra classes for the popup surface. */
  className?: string
  /** Extra classes for the fallback trigger button (ignored when `trigger` is an element). */
  triggerClassName?: string
}

export function DropdownMenu(props: DropdownMenuProps) {
  const {
    trigger,
    items,
    children,
    label,
    side = 'bottom',
    align = 'end',
    sideOffset = 6,
    open,
    defaultOpen,
    onOpenChange,
    modal = false,
    disabled = false,
    className,
    triggerClassName,
  } = props

  return (
    <Menu.Root
      defaultOpen={defaultOpen}
      disabled={disabled}
      modal={modal}
      onOpenChange={onOpenChange}
      open={open}
    >
      {isValidElement(trigger) ? (
        <Menu.Trigger disabled={disabled} render={trigger} />
      ) : (
        <Menu.Trigger
          className={cn(fallbackTriggerClasses, triggerClassName)}
          disabled={disabled}
        >
          {trigger}
        </Menu.Trigger>
      )}
      <Menu.Portal>
        <Menu.Positioner
          align={align}
          className="z-[85] outline-none"
          side={side}
          sideOffset={sideOffset}
        >
          <Menu.Popup
            aria-label={label}
            className={cn(
              'panel max-h-[min(24rem,calc(100vh-6rem))] min-w-[11rem] max-w-[min(20rem,calc(100vw-2rem))] overflow-y-auto p-1 outline-none',
              className,
            )}
          >
            {items?.map((item) => (
              <Fragment key={item.id}>
                {item.separatorBefore ? (
                  <Menu.Separator className="my-1 h-px bg-border" />
                ) : null}
                <Menu.Item
                  className={cn(
                    dropdownMenuItemClasses,
                    itemToneClasses[item.destructive ? 'destructive' : 'default'],
                  )}
                  disabled={item.disabled}
                  label={item.label}
                  onClick={item.onSelect}
                >
                  {item.icon ? (
                    <span
                      aria-hidden="true"
                      className="grid size-4 shrink-0 place-items-center [&_svg]:size-4 [&_svg]:shrink-0"
                    >
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint ? (
                    <span className="mono shrink-0 text-xs text-muted">{item.hint}</span>
                  ) : null}
                </Menu.Item>
              </Fragment>
            ))}
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
