import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible'
import type { ReactElement, ReactNode } from 'react'

import { cn } from '@/lib/utils'

type CollapsibleProps = {
  /** Controlled disclosure state. Parents own this state (ApiKeyCard, LogsPage row detail). */
  open: boolean
  onOpenChange: (open: boolean) => void
  disabled?: boolean
  className?: string
  children: ReactNode
}

type CollapsibleTriggerProps = {
  className?: string
  /** Render as another element (e.g. a Button) while keeping trigger wiring. */
  render?: ReactElement
  children: ReactNode
}

type CollapsiblePanelProps = {
  className?: string
  /** Keep the panel markup mounted while it is closed. */
  keepMounted?: boolean
  /** Let the browser's in-page search find and expand the panel. */
  hiddenUntilFound?: boolean
  children: ReactNode
}

function CollapsibleRoot(props: CollapsibleProps) {
  return (
    <BaseCollapsible.Root
      className={props.className}
      disabled={props.disabled}
      onOpenChange={(nextOpen: boolean) => props.onOpenChange(nextOpen)}
      open={props.open}
    >
      {props.children}
    </BaseCollapsible.Root>
  )
}

function CollapsibleTrigger(props: CollapsibleTriggerProps) {
  return (
    <BaseCollapsible.Trigger
      className={cn(
        'inline-flex min-h-9 items-center gap-2 rounded-[4px] text-sm font-semibold text-foreground transition-colors hover:text-primary disabled:cursor-not-allowed disabled:text-muted/50 [&_svg]:size-4 [&_svg]:shrink-0',
        props.className,
      )}
      render={props.render}
    >
      {props.children}
    </BaseCollapsible.Trigger>
  )
}

function CollapsiblePanel(props: CollapsiblePanelProps) {
  return (
    <BaseCollapsible.Panel
      className={cn('overflow-hidden', props.className)}
      hiddenUntilFound={props.hiddenUntilFound}
      keepMounted={props.keepMounted}
    >
      {props.children}
    </BaseCollapsible.Panel>
  )
}

export const Collapsible = Object.assign(CollapsibleRoot, {
  Trigger: CollapsibleTrigger,
  Panel: CollapsiblePanel,
})
