import InboxIcon from 'lucide-react/dist/esm/icons/inbox'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type DataTableEmptyProps = {
  title: string
  description?: string
  /** Pass an icon element that already carries `aria-hidden="true"`. */
  icon?: ReactNode
  action?: ReactNode
  /**
   * Renders inside a table row spanning this many columns. Omit to render the
   * bare block, which is what MobileCardList uses.
   */
  colSpan?: number
  className?: string
}

export function DataTableEmpty(props: DataTableEmptyProps) {
  const block = (
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

  if (props.colSpan === undefined) return block

  return (
    <tr className="border-t border-border">
      <td className="px-5 py-4" colSpan={props.colSpan}>
        {block}
      </td>
    </tr>
  )
}
