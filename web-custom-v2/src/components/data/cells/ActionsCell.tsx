import type { MouseEvent, ReactNode } from 'react'

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export type DataTableRowAction = {
  id: string
  /** Becomes both `aria-label` and `title` on the icon-only button. */
  label: string
  icon: ReactNode
  onClick: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
  /** Async in flight: the button is disabled and `aria-busy`. */
  busy?: boolean
}

type ActionsCellProps = {
  actions?: DataTableRowAction[]
  /** Extra controls rendered after `actions`. */
  children?: ReactNode
  /** Names a `role="group"` around the row's controls. */
  label?: string
  className?: string
}

/**
 * Right-aligned icon-button row. Clicks are kept from reaching an `onRowClick`
 * handler on the surrounding row.
 */
export function ActionsCell(props: ActionsCellProps) {
  const groupProps = props.label ? { role: 'group' as const, 'aria-label': props.label } : {}

  return (
    <div
      className={cn('flex items-center justify-end gap-1', props.className)}
      onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
      {...groupProps}
    >
      {props.actions?.map((action) => (
        <Button
          aria-busy={action.busy ?? false}
          aria-label={action.label}
          disabled={(action.disabled ?? false) || (action.busy ?? false)}
          key={action.id}
          onClick={action.onClick}
          size="icon-md"
          title={action.label}
          variant={action.tone === 'danger' ? 'danger' : 'quiet'}
        >
          <span aria-hidden="true" className="inline-flex">
            {action.icon}
          </span>
        </Button>
      ))}
      {props.children}
    </div>
  )
}
