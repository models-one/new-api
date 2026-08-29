import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import XIcon from 'lucide-react/dist/esm/icons/x'
import type { ReactNode, RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl'

type DialogProps = {
  /** Controlled open state. */
  open: boolean
  /** Called with the requested next open state (Escape, backdrop press, close button). */
  onOpenChange: (open: boolean) => void
  /** Accessible name of the dialog; rendered as the `<h2>` the popup is labelled by. */
  title: string
  /** Optional supporting copy rendered as the dialog description. */
  description?: string
  size?: DialogSize
  /** Action row pinned under the scroll body. */
  footer?: ReactNode
  /** `false` keeps focus where it is; a ref moves focus to that element on open. */
  initialFocus?: boolean | RefObject<HTMLElement | null>
  /** `false` blocks Escape and backdrop dismissal; the close button still closes. */
  dismissible?: boolean
  /** `false` lets the body grow instead of scrolling inside the popup. */
  scrollBody?: boolean
  /** Hide the header close button (only do this when the footer offers a cancel action). */
  hideCloseButton?: boolean
  /** Overrides the close button's accessible name; defaults to the translated "Close". */
  closeLabel?: string
  className?: string
  bodyClassName?: string
  children?: ReactNode
}

const sizeClasses: Record<DialogSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
}

export function Dialog(props: DialogProps) {
  const { t } = useTranslation()
  const {
    open,
    onOpenChange,
    title,
    description,
    size = 'md',
    footer,
    initialFocus,
    dismissible = true,
    scrollBody = true,
    hideCloseButton = false,
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
        <BaseDialog.Viewport className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto p-4">
          <BaseDialog.Popup
            aria-modal="true"
            className={cn(
              'panel flex max-h-[min(860px,calc(100svh-2rem))] w-full flex-col overflow-hidden transition-opacity duration-150 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
              sizeClasses[size],
              className,
            )}
            initialFocus={initialFocus}
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <BaseDialog.Title className="text-xl font-bold leading-tight text-foreground">
                  {title}
                </BaseDialog.Title>
                {description ? (
                  <BaseDialog.Description className="mt-1 text-sm leading-6 text-muted">
                    {description}
                  </BaseDialog.Description>
                ) : null}
              </div>
              {hideCloseButton ? null : (
                <Button
                  aria-label={resolvedCloseLabel}
                  onClick={() => onOpenChange(false)}
                  size="icon-md"
                  title={resolvedCloseLabel}
                  variant="quiet"
                >
                  <XIcon aria-hidden="true" />
                </Button>
              )}
            </header>

            <div
              className={cn(
                'px-5 py-5 sm:px-6',
                scrollBody ? 'min-h-0 flex-1 overflow-y-auto' : 'shrink-0',
                bodyClassName,
              )}
            >
              {children}
            </div>

            {footer ? (
              <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                {footer}
              </footer>
            ) : null}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
