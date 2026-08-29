import { Tabs as BaseTabs } from '@base-ui/react/tabs'
import { createContext, useContext, type ReactElement, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type TabsVariant = 'underline' | 'pill'
type TabsOrientation = 'horizontal' | 'vertical'

type TabsProps = {
  /** Controlled active tab value. Pair with `onValueChange`. */
  value?: string
  /** Initial active tab value when the component is left uncontrolled. */
  defaultValue?: string
  onValueChange?: (value: string) => void
  orientation?: TabsOrientation
  variant?: TabsVariant
  className?: string
  children: ReactNode
}

type TabsListProps = {
  /** Accessible name for the `role="tablist"` element. */
  label?: string
  className?: string
  children: ReactNode
}

type TabsTabProps = {
  value: string
  disabled?: boolean
  className?: string
  render?: ReactElement
  children: ReactNode
}

type TabsPanelProps = {
  value: string
  /** Keep the panel markup mounted while it is hidden. */
  keepMounted?: boolean
  className?: string
  children: ReactNode
}

const TabsVariantContext = createContext<TabsVariant>('underline')

const tabBaseClasses =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:text-muted/50 [&_svg]:size-4 [&_svg]:shrink-0'

function TabsRoot(props: TabsProps) {
  const {
    children,
    className,
    defaultValue,
    onValueChange,
    orientation = 'horizontal',
    value,
    variant = 'underline',
  } = props

  return (
    <TabsVariantContext.Provider value={variant}>
      <BaseTabs.Root
        className={cn('flex gap-4', orientation === 'vertical' ? 'flex-row' : 'flex-col', className)}
        defaultValue={defaultValue}
        onValueChange={(nextValue: unknown) => {
          if (typeof nextValue === 'string') onValueChange?.(nextValue)
        }}
        orientation={orientation}
        value={value}
      >
        {children}
      </BaseTabs.Root>
    </TabsVariantContext.Provider>
  )
}

function TabsList(props: TabsListProps) {
  const variant = useContext(TabsVariantContext)

  return (
    <BaseTabs.List
      aria-label={props.label}
      className={(state) => {
        const vertical = state.orientation === 'vertical'
        if (variant === 'pill') {
          return cn(
            'flex gap-1 rounded-[6px] border border-border bg-sidebar p-1',
            vertical ? 'flex-col items-stretch' : 'items-center',
            props.className,
          )
        }
        return cn(
          'flex gap-1',
          vertical ? 'flex-col items-stretch border-r border-border' : 'items-center border-b border-border',
          props.className,
        )
      }}
    >
      {props.children}
    </BaseTabs.List>
  )
}

function TabsTab(props: TabsTabProps) {
  const variant = useContext(TabsVariantContext)

  return (
    <BaseTabs.Tab
      className={(state) => {
        if (variant === 'pill') {
          return cn(
            tabBaseClasses,
            'min-h-9 rounded-[4px] px-4',
            state.active ? 'bg-surface-high text-primary' : 'text-muted hover:text-foreground',
            props.className,
          )
        }
        const edge = state.orientation === 'vertical' ? '-mr-px border-r-2' : '-mb-px border-b-2'
        return cn(
          tabBaseClasses,
          'min-h-10 px-4',
          edge,
          state.active ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-foreground',
          props.className,
        )
      }}
      disabled={props.disabled}
      render={props.render}
      value={props.value}
    >
      {props.children}
    </BaseTabs.Tab>
  )
}

function TabsPanel(props: TabsPanelProps) {
  return (
    <BaseTabs.Panel
      className={cn('min-w-0 flex-1 outline-none', props.className)}
      keepMounted={props.keepMounted}
      value={props.value}
    >
      {props.children}
    </BaseTabs.Panel>
  )
}

export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Tab: TabsTab,
  Panel: TabsPanel,
})
