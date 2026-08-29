import type { ReactNode } from 'react'

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
  const hasActions = props.action !== undefined || props.secondaryAction !== undefined

  return (
    <main
      aria-label={props.label}
      className={cn('settings-canvas grid min-h-screen place-items-center px-6 py-12 text-center', props.className)}
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
  )
}
