import InboxIcon from 'lucide-react/dist/esm/icons/inbox'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type DataTableEmptyProps = {
  title: string
  description?: string
  /** Pass an icon element that already carries `aria-hidden="true"`. */
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

/**
 * The block a list shows instead of rows. It is rendered beside the table, never as a
 * spanning cell: inside the table it inherited the table's min-width, so on a phone a
 * 1180px-wide "nothing here" centred its own text off-screen.
 */
export function DataTableEmpty(props: DataTableEmptyProps) {
  return (
    <div className={cn('grid min-h-52 place-items-center px-6 py-10 text-center', props.className)}>
      <div className="max-w-md">
        {props.icon ?? <InboxIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
        <p className="mt-4 text-base font-bold text-foreground">{props.title}</p>
        {props.description ? (
          <p className="mt-2 text-sm leading-6 text-muted">{props.description}</p>
        ) : null}
        {props.action ? <div className="mt-5">{props.action}</div> : null}
      </div>
    </div>
  )
}
