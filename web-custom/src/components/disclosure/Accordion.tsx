import { Accordion as BaseAccordion } from '@base-ui/react/accordion'
import type { ReactElement, ReactNode } from 'react'

import { cn } from '@/lib/utils'

type AccordionType = 'single' | 'multiple'
type AccordionHeadingLevel = 2 | 3 | 4

type AccordionProps = {
  /** `single` keeps one item open at a time; `multiple` allows several. */
  type?: AccordionType
  /** Whether the open item may be closed again. Only meaningful for `single`. */
  collapsible?: boolean
  /** Controlled list of open item values. Pair with `onValueChange`. */
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[]) => void
  /** Keep every panel mounted while closed. */
  keepMounted?: boolean
  className?: string
  children: ReactNode
}

type AccordionItemProps = {
  value: string
  disabled?: boolean
  className?: string
  children: ReactNode
}

type AccordionHeaderProps = {
  /** Heading level of the emitted element, so the surrounding document order stays valid. */
  headingLevel?: AccordionHeadingLevel
  className?: string
  children: ReactNode
}

type AccordionTriggerProps = {
  className?: string
  render?: ReactElement
  children: ReactNode
}

type AccordionPanelProps = {
  className?: string
  keepMounted?: boolean
  hiddenUntilFound?: boolean
  children: ReactNode
}

const headingElements: Record<AccordionHeadingLevel, ReactElement> = {
  2: <h2 />,
  3: <h3 />,
  4: <h4 />,
}

function AccordionRoot(props: AccordionProps) {
  const {
    children,
    className,
    collapsible = true,
    defaultValue,
    keepMounted,
    onValueChange,
    type = 'single',
    value,
  } = props

  return (
    <BaseAccordion.Root<string>
      className={cn('flex flex-col', className)}
      defaultValue={defaultValue}
      keepMounted={keepMounted}
      multiple={type === 'multiple'}
      onValueChange={(nextValue: string[], eventDetails) => {
        if (!collapsible && nextValue.length === 0) {
          eventDetails.cancel()
          return
        }
        onValueChange?.(nextValue)
      }}
      value={value}
    >
      {children}
    </BaseAccordion.Root>
  )
}

function AccordionItem(props: AccordionItemProps) {
  return (
    <BaseAccordion.Item
      className={cn('border-b border-border last:border-b-0', props.className)}
      disabled={props.disabled}
      value={props.value}
    >
      {props.children}
    </BaseAccordion.Item>
  )
}

function AccordionHeader(props: AccordionHeaderProps) {
  return (
    <BaseAccordion.Header
      className={cn('m-0 text-sm font-bold text-foreground', props.className)}
      render={headingElements[props.headingLevel ?? 3]}
    >
      {props.children}
    </BaseAccordion.Header>
  )
}

function AccordionTrigger(props: AccordionTriggerProps) {
  return (
    <BaseAccordion.Trigger
      className={cn(
        'flex min-h-10 w-full items-center justify-between gap-3 px-1 py-2 text-left text-sm font-semibold text-foreground transition-colors hover:text-primary disabled:cursor-not-allowed disabled:text-muted/50 [&_svg]:size-4 [&_svg]:shrink-0',
        props.className,
      )}
      render={props.render}
    >
      {props.children}
    </BaseAccordion.Trigger>
  )
}

function AccordionPanel(props: AccordionPanelProps) {
  return (
    <BaseAccordion.Panel
      className={cn('overflow-hidden px-1 pb-4 text-sm leading-6 text-muted', props.className)}
      hiddenUntilFound={props.hiddenUntilFound}
      keepMounted={props.keepMounted}
    >
      {props.children}
    </BaseAccordion.Panel>
  )
}

export const Accordion = Object.assign(AccordionRoot, {
  Item: AccordionItem,
  Header: AccordionHeader,
  Trigger: AccordionTrigger,
  Panel: AccordionPanel,
})
