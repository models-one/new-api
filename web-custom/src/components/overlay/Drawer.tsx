import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import XIcon from 'lucide-react/dist/esm/icons/x'
import type { ReactNode, RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export type DrawerSide = 'right' | 'bottom'
export type DrawerSize = 'sm' | 'md' | 'lg' | 'xl'

type DrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Accessible name of the sheet; rendered as the `<h2>` the popup is labelled by. */
  title: string
  description?: string
  side?: DrawerSide
  size?: DrawerSize
  /** Action row pinned to the bottom of the sheet. */
  footer?: ReactNode
  initialFocus?: boolean | RefObject<HTMLElement | null>
  /** `false` blocks Escape and backdrop dismissal; the close button still closes. */
  dismissible?: boolean
  closeLabel?: string
  className?: string
  bodyClassName?: string
  children?: ReactNode
}

type DrawerSectionProps = {
  /** Uppercase caption for the section. */
  title: string
  description?: string
  /** Trailing control aligned with the caption (a count, a link, a small button). */
  action?: ReactNode
  className?: string
  children?: ReactNode
}

type DrawerSwitchRowProps = {
  label: string
  description?: string
  /** The control on the right: a Switch, Select, Button, Badge... */
  control?: ReactNode
  /** Set when `control` is a real form control so the label points at it. */
  controlId?: string
  className?: string
}

const sideClasses: Record<DrawerSide, string> = {
  right: 'inset-y-0 right-0 h-full w-full border-l border-border',
  bottom: 'inset-x-0 bottom-0 w-full border-t border-border',
}

const rightSizeClasses: Record<DrawerSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

const bottomSizeClasses: Record<DrawerSize, string> = {
  sm: 'h-[45svh]',
  md: 'h-[60svh]',
  lg: 'h-[75svh]',
  xl: 'h-[90svh]',
}

function DrawerSection(props: DrawerSectionProps) {
  return (
    <section className={cn('py-5 first:pt-0 last:pb-0', props.className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="eyebrow">{props.title}</h3>
        {props.action}
      </div>
      {props.description ? (
        <p className="mt-1.5 text-xs leading-5 text-muted">{props.description}</p>
      ) : null}
      <div className="mt-3 divide-y divide-border border-y border-border">{props.children}</div>
    </section>
  )
}

function DrawerSwitchRow(props: DrawerSwitchRowProps) {
  return (
    <div
      className={cn(
        'flex min-h-16 items-center justify-between gap-4 px-1 py-3',
        props.className,
      )}
    >
      <div className="min-w-0">
        {props.controlId ? (
          <label className="block text-sm font-semibold text-foreground" htmlFor={props.controlId}>
            {props.label}
          </label>
        ) : (
          <p className="text-sm font-semibold text-foreground">{props.label}</p>
        )}
        {props.description ? (
          <p className="mt-0.5 text-xs leading-5 text-muted">{props.description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{props.control}</div>
    </div>
  )
}

export function Drawer(props: DrawerProps) {
  const { t } = useTranslation()
  const {
    open,
    onOpenChange,
    title,
    description,
    side = 'right',
    size = 'md',
    footer,
    initialFocus,
    dismissible = true,
    closeLabel,
    className,
    bodyClassName,
    children,
  } = props

  const resolvedCloseLabel = closeLabel ?? t('Close')

  return (
    <BaseDialog.Root
      disablePointerDismissal={!dismissible}
      onOpenChange={(nextOpen, eventDetails) => {
        if (!dismissible && !nextOpen && eventDetails.reason === 'escape-key') {
          eventDetails.cancel()
          return
        }
        onOpenChange(nextOpen)
      }}
      open={open}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm transition-opacity duration-150 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BaseDialog.Popup
          aria-modal="true"
          className={cn(
            'panel fixed z-[81] flex flex-col overflow-hidden rounded-none shadow-[0_0_60px_rgba(0,0,0,0.45)] transition-transform duration-200 ease-out',
            sideClasses[side],
            side === 'right' ? rightSizeClasses[size] : bottomSizeClasses[size],
            side === 'right'
              ? 'data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full'
              : 'data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full',
            className,
          )}
          initialFocus={initialFocus}
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <BaseDialog.Title className="text-lg font-bold leading-tight text-foreground">
                {title}
              </BaseDialog.Title>
              {description ? (
                <BaseDialog.Description className="mt-1 text-sm leading-6 text-muted">
                  {description}
                </BaseDialog.Description>
              ) : null}
            </div>
            <Button
              aria-label={resolvedCloseLabel}
              onClick={() => onOpenChange(false)}
              size="icon-md"
              title={resolvedCloseLabel}
              variant="quiet"
            >
              <XIcon aria-hidden="true" />
            </Button>
          </header>

          <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-5', bodyClassName)}>
            {children}
          </div>

          {footer ? (
            <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-surface/60 px-5 py-4 sm:flex-row sm:justify-end">
              {footer}
            </footer>
          ) : null}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

Drawer.Section = DrawerSection
Drawer.SwitchRow = DrawerSwitchRow
