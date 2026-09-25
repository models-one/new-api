import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type DescriptionListItem = {
  /** Stable key; falls back to the term. */
  id?: string
  term: string
  description: ReactNode
}

type DescriptionListProps = {
  items: readonly DescriptionListItem[]
  /** `row` keeps term and value on one line; `stacked` puts the value underneath. */
  layout?: 'row' | 'stacked'
  /** Accessible name when the list is not already inside a labelled region. */
  label?: string
  dense?: boolean
  className?: string
}

export function DescriptionList(props: DescriptionListProps) {
  const { items, layout = 'row', label, dense = false, className } = props

  return (
    <dl
      aria-label={label}
      className={cn('divide-y divide-border border-y border-border text-sm', className)}
    >
      {items.map((item) => (
        <div
          className={cn(
            dense ? 'py-2.5' : 'py-3',
            layout === 'row' ? 'flex items-center justify-between gap-4' : 'flex flex-col gap-1',
          )}
          key={item.id ?? item.term}
        >
          <dt className="eyebrow shrink-0">{item.term}</dt>
          <dd
            className={cn(
              'min-w-0 text-foreground',
              layout === 'row' ? 'truncate text-right' : 'text-left',
            )}
          >
            {item.description}
          </dd>
        </div>
      ))}
    </dl>
  )
}
