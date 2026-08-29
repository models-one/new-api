import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'

type PanelProps = HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'section' | 'div'
  muted?: boolean
}

type PanelHeadingLevel = 2 | 3 | 4

type PanelHeaderProps = {
  title: ReactNode
  description?: ReactNode
  /** Leading element, usually an IconBadge or a lucide icon. */
  icon?: ReactNode
  /** Trailing controls, aligned right. */
  actions?: ReactNode
  /** Drop to 3 or 4 when the panel sits under another heading. */
  headingLevel?: PanelHeadingLevel
  /** Set to wire the panel to `aria-labelledby`. */
  titleId?: string
  className?: string
}

type PanelBodyProps = HTMLAttributes<HTMLDivElement> & {
  /** Removes the standard `px-5 py-4` gutter (tables and charts own their padding). */
  padded?: boolean
  scroll?: boolean
}

type PanelFooterProps = HTMLAttributes<HTMLDivElement> & {
  align?: 'start' | 'between' | 'end'
}

const headingTags: Record<PanelHeadingLevel, 'h2' | 'h3' | 'h4'> = {
  2: 'h2',
  3: 'h3',
  4: 'h4',
}

const alignClasses: Record<'start' | 'between' | 'end', string> = {
  start: 'justify-start',
  between: 'justify-between',
  end: 'justify-end',
}

function PanelRoot(props: PanelProps) {
  const { as: Component = 'section', className, muted = false, ...panelProps } = props

  return <Component className={cn(muted ? 'panel-muted' : 'panel', className)} {...panelProps} />
}

function PanelHeader(props: PanelHeaderProps) {
  const Heading = headingTags[props.headingLevel ?? 2]

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-b border-border px-5 py-4',
        props.className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {props.icon ? <span className="shrink-0 [&_svg]:size-5">{props.icon}</span> : null}
        <div className="min-w-0">
          <Heading className="truncate text-lg font-bold text-foreground" id={props.titleId}>
            {props.title}
          </Heading>
          {props.description ? (
            <p className="mt-1 text-sm leading-5 text-muted">{props.description}</p>
          ) : null}
        </div>
      </div>
      {props.actions ? (
        <div className="flex shrink-0 items-center gap-2">{props.actions}</div>
      ) : null}
    </div>
  )
}

function PanelBody(props: PanelBodyProps) {
  const { className, padded = true, scroll = false, ...bodyProps } = props

  return (
    <div
      className={cn(padded && 'px-5 py-4', scroll && 'overflow-y-auto', className)}
      {...bodyProps}
    />
  )
}

function PanelFooter(props: PanelFooterProps) {
  const { className, align = 'end', ...footerProps } = props

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 border-t border-border px-5 py-4',
        alignClasses[align],
        className,
      )}
      {...footerProps}
    />
  )
}

export const Panel = Object.assign(PanelRoot, {
  Header: PanelHeader,
  Body: PanelBody,
  Footer: PanelFooter,
})
