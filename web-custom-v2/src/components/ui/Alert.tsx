import XIcon from 'lucide-react/dist/esm/icons/x'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/Button'
import { toneSurfaceClasses, toneTextClasses, type Tone } from '@/components/ui/tone'
import { cn } from '@/lib/utils'

type AlertDismissProps =
  | {
      dismissible: true
      /** Accessible name for the icon-only close control. */
      dismissLabel: string
      onDismiss: () => void
    }
  | {
      dismissible?: false
      dismissLabel?: never
      onDismiss?: never
    }

type AlertProps = {
  tone?: Tone
  title?: string
  /** Leading icon element, rendered in the tone colour. */
  icon?: ReactNode
  /** Trailing controls (a link or a Button). */
  action?: ReactNode
  children?: ReactNode
  className?: string
  /** `alert` interrupts, `status` is polite. Defaults to `alert` for the destructive tone. */
  live?: 'alert' | 'status'
} & AlertDismissProps

export function Alert(props: AlertProps) {
  const {
    tone = 'info',
    title,
    icon,
    action,
    children,
    className,
    live,
    dismissible = false,
    dismissLabel,
    onDismiss,
  } = props

  const role = live ?? (tone === 'destructive' ? 'alert' : 'status')

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius-panel)] border p-4 text-sm leading-6',
        toneSurfaceClasses[tone],
        'text-foreground',
        className,
      )}
      role={role}
    >
      {icon ? (
        <span aria-hidden="true" className={cn('mt-0.5 shrink-0 [&_svg]:size-4', toneTextClasses[tone])}>
          {icon}
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        {title ? <p className="font-bold text-foreground">{title}</p> : null}
        {children ? <div className={cn('text-muted', title && 'mt-1')}>{children}</div> : null}
        {action ? <div className="mt-3 flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>

      {dismissible && dismissLabel && onDismiss ? (
        <Button
          aria-label={dismissLabel}
          className="-mr-1 -mt-1 shrink-0"
          onClick={onDismiss}
          size="icon-sm"
          title={dismissLabel}
          variant="quiet"
        >
          <XIcon aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}
