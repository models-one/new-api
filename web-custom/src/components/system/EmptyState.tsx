import InboxIcon from 'lucide-react/dist/esm/icons/inbox'
import type { ReactNode } from 'react'

type EmptyStateProps = {
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState(props: EmptyStateProps) {
  return (
    <div className="grid min-h-52 place-items-center border-y border-border px-6 py-10 text-center">
      <div className="max-w-md">
        <InboxIcon aria-hidden="true" className="mx-auto size-7 text-muted" />
        <h2 className="mt-4 text-base font-bold">{props.title}</h2>
        {props.description ? <p className="mt-2 text-sm leading-6 text-muted">{props.description}</p> : null}
        {props.action ? <div className="mt-5">{props.action}</div> : null}
      </div>
    </div>
  )
}
