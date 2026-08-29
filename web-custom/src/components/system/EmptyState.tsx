import InboxIcon from 'lucide-react/dist/esm/icons/inbox'
import type { ReactNode } from 'react'

type EmptyStateHeadingLevel = 2 | 3 | 4

type EmptyStateProps = {
  title: string
  description?: string
  action?: ReactNode
  /**
   * Heading level of the emitted title. Drop to 3 or 4 when the empty state
   * sits inside a Panel that already owns a heading.
   */
  headingLevel?: EmptyStateHeadingLevel
}

const headingTags: Record<EmptyStateHeadingLevel, 'h2' | 'h3' | 'h4'> = {
  2: 'h2',
  3: 'h3',
  4: 'h4',
}

export function EmptyState(props: EmptyStateProps) {
  const Heading = headingTags[props.headingLevel ?? 2]

  return (
    <div className="grid min-h-52 place-items-center border-y border-border px-6 py-10 text-center">
      <div className="max-w-md">
        <InboxIcon aria-hidden="true" className="mx-auto size-7 text-muted" />
        <Heading className="mt-4 text-base font-bold">{props.title}</Heading>
        {props.description ? <p className="mt-2 text-sm leading-6 text-muted">{props.description}</p> : null}
        {props.action ? <div className="mt-5">{props.action}</div> : null}
      </div>
    </div>
  )
}
