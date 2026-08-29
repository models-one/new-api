import { Alert } from '@/components/ui/Alert'
import { Spinner } from '@/components/ui/Spinner'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { ProviderIcon } from '@/features/auth/components/ProviderIcon'

import type { OAuthProviderIcon } from '@/features/auth/oauth-providers'
import type { ReactNode } from 'react'

type CallbackScreenProps = {
  title: string
  description: string
  icon: OAuthProviderIcon
} & (
  | {
      status: 'working'
      /** Announced alongside the spinner by the live region. */
      busyLabel: string
      hint?: string
      heading?: never
      message?: never
      actions?: never
    }
  | {
      status: 'failed' | 'done'
      /** Short headline for the alert, e.g. why the handshake stopped. */
      heading: string
      message: string
      /** Recovery controls. A callback that ends without one is a dead end. */
      actions: ReactNode
      busyLabel?: never
      hint?: never
    }
)

/**
 * The one screen all three callback routes render.
 *
 * A callback is a page the user never asked to look at, so it has exactly two
 * jobs: say out loud that something is happening, and — when it is not going to
 * happen — say why and offer a way out. The working state is a `role="status"`
 * live region rather than a bare spinner, so a screen reader is told the page is
 * mid-handshake instead of being handed silence.
 */
export function CallbackScreen(props: CallbackScreenProps) {
  return (
    <AuthLayout description={props.description} title={props.title}>
      <div className="flex justify-center">
        <span className="flex size-14 items-center justify-center rounded-full border border-border bg-surface-high text-primary [&_svg]:size-6">
          <ProviderIcon icon={props.icon} />
        </span>
      </div>

      {props.status === 'working' ? (
        <div aria-busy="true" className="flex flex-col items-center gap-3 text-center" role="status">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Spinner decorative size="sm" />
            {props.busyLabel}
          </span>
          {props.hint === undefined ? null : (
            <p className="text-sm leading-6 text-muted">{props.hint}</p>
          )}
        </div>
      ) : (
        <>
          <Alert
            live={props.status === 'failed' ? 'alert' : 'status'}
            title={props.heading}
            tone={props.status === 'failed' ? 'destructive' : 'success'}
          >
            {props.message}
          </Alert>
          <div className="flex flex-wrap gap-3">{props.actions}</div>
        </>
      )}
    </AuthLayout>
  )
}
