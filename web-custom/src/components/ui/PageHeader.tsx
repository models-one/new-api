import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  description?: string
  /** Small uppercase caption above the title. */
  eyebrow?: string
  /** Primary controls. Rendered next to `status`, not instead of it. */
  action?: ReactNode
  /** Live state, e.g. a StatusBadge or "System operational". */
  status?: ReactNode
  /** Breadcrumb trail, rendered above the title. Supply a labelled `nav`. */
  breadcrumb?: ReactNode
  /** Section tabs, rendered under the title inside the header rule. */
  tabs?: ReactNode
  className?: string
}

export function PageHeader(props: PageHeaderProps) {
  const hasTrailing = props.action !== undefined || props.status !== undefined

  return (
    <header className={cn('flex flex-col gap-5 border-b border-border pb-6', props.className)}>
      {props.breadcrumb}

      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {props.eyebrow ? <p className="eyebrow mb-2">{props.eyebrow}</p> : null}
          <h1 className="text-3xl font-bold leading-tight text-foreground md:text-4xl">
            {props.title}
          </h1>
          {props.description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted md:text-base">
              {props.description}
            </p>
          ) : null}
        </div>

        {hasTrailing ? (
          <div className="flex flex-wrap items-center gap-3 md:shrink-0 md:justify-end">
            {props.status}
            {props.action}
          </div>
        ) : null}
      </div>

      {props.tabs}
    </header>
  )
}
