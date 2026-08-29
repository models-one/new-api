import { cn } from '@/lib/utils'

type SeparatorOrientation = 'horizontal' | 'vertical'

type SeparatorProps = {
  orientation?: SeparatorOrientation
  /** Decorative separators are hidden from assistive technology. */
  decorative?: boolean
  /** Pull the rule away from the container edges (matches the `px-5` panel gutter). */
  inset?: boolean
  className?: string
}

export function Separator(props: SeparatorProps) {
  const { orientation = 'horizontal', decorative = true, inset = false, className } = props
  const horizontal = orientation === 'horizontal'

  const semantics = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ 'aria-orientation': orientation, role: 'separator' } as const)

  return (
    <div
      className={cn(
        'shrink-0 bg-border',
        horizontal ? 'h-px w-full' : 'min-h-4 w-px self-stretch',
        inset && (horizontal ? 'mx-5 w-auto' : 'my-3'),
        className,
      )}
      {...semantics}
    />
  )
}
