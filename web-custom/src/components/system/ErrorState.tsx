import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { ServerStatus } from '@/lib/api/status'
import { queryClient } from '@/lib/query-client'
import { cn } from '@/lib/utils'

type ErrorStateProps = {
  /** Short status numeral rendered at display size, e.g. `404`. */
  code?: string
  title: string
  description?: string
  /** Decorative mark shown above the code. Icons passed here must be `aria-hidden`. */
  icon?: ReactNode
  /** Primary recovery control. */
  action?: ReactNode
  /** Optional second control rendered beside `action`. */
  secondaryAction?: ReactNode
  /** Accessible name for the emitted `main` landmark. */
  label?: string
  className?: string
}

export function ErrorState(props: ErrorStateProps) {
  const { t } = useTranslation()
  // Read the cached status rather than subscribing to it. This component is what the
  // router renders when something already went wrong, including a failure early enough
  // that no provider is mounted — `useQuery` would throw there and replace the error
  // page with a blank screen. An unfetched cache simply means no brand line.
  const status = queryClient.getQueryData<ServerStatus>(['server-status'])
  const systemName = status?.system_name?.trim() ?? ''
  const logo = status?.logo?.trim() ?? ''
  const hasActions = props.action !== undefined || props.secondaryAction !== undefined

  return (
    // The same canvas, gutter and brand lockup the three authentication pages carry.
    // Landing on a status page used to drop the brand entirely, so a 404 read as a page
    // from nowhere rather than a page of this deployment.
    <div className="settings-canvas flex min-h-screen flex-col">
      <header className="flex min-h-[4.25rem] items-center px-4 py-5 sm:px-8">
        {/* Only when the deployment's identity is actually known. A generic placeholder
            here would duplicate the "Back to home" action below it. */}
        {systemName === '' && logo === '' ? null : (
          <Link
            aria-label={systemName === '' ? t('Back to home') : systemName}
            className="inline-flex items-center gap-2.5 rounded-[4px] text-muted transition-colors hover:text-foreground"
            to="/"
          >
            {logo === '' ? null : (
              <img alt="" className="size-7 rounded-full object-cover" src={logo} />
            )}
            {systemName === '' ? null : (
              <span className="text-base font-bold text-foreground">{systemName}</span>
            )}
          </Link>
        )}
      </header>

      <main
        aria-label={props.label}
        className={cn('grid flex-1 place-items-center px-4 pb-14 text-center sm:px-8', props.className)}
      >
        <div className="max-w-lg">
          {props.icon ? (
            <div className="flex justify-center text-primary [&_svg]:size-8">{props.icon}</div>
          ) : null}
          {props.code ? (
            <p className={cn('mono font-bold leading-none text-primary', props.icon ? 'mt-6' : '', 'text-6xl md:text-7xl')}>
              {props.code}
            </p>
          ) : null}
          <h1 className="mt-5 text-2xl font-bold text-foreground">{props.title}</h1>
          {props.description ? (
            <p className="mt-3 text-sm leading-6 text-muted">{props.description}</p>
          ) : null}
          {hasActions ? (
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {props.action}
              {props.secondaryAction}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
