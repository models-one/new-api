import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  description: string
  action?: ReactNode
  status?: ReactNode
}

export function PageHeader(props: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-5 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold leading-tight text-foreground md:text-4xl">
          {props.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted md:text-base">
          {props.description}
        </p>
      </div>
      {props.action ?? props.status}
    </header>
  )
}
