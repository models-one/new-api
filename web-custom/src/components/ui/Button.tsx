import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import type { ButtonHTMLAttributes, ReactElement } from 'react'

import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'outline' | 'quiet' | 'danger'
type ButtonSize = 'md' | 'sm' | 'icon-lg' | 'icon-md' | 'icon-sm' | 'icon-xs'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Render as another element (e.g. a router Link) while keeping button styling. */
  render?: ReactElement
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border-primary bg-primary text-primary-foreground hover:bg-primary-strong disabled:border-border disabled:bg-surface-high disabled:text-muted',
  outline:
    'border-primary bg-transparent text-primary hover:bg-primary/10 disabled:border-border disabled:text-muted',
  quiet:
    'border-transparent bg-transparent text-muted hover:bg-surface-high hover:text-foreground disabled:text-muted/50',
  danger:
    'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50',
}

const sizeClasses: Record<ButtonSize, string> = {
  md: 'min-h-10 px-4 py-2 text-sm',
  sm: 'min-h-8 px-3 py-1 text-xs',
  'icon-lg': 'size-10 min-h-10 px-0',
  'icon-md': 'size-9 min-h-9 px-0',
  'icon-sm': 'size-8 min-h-8 px-0',
  'icon-xs': 'size-7 min-h-7 px-0',
}

export function Button(props: ButtonProps) {
  const { className, variant = 'primary', size = 'md', render, type, ...buttonProps } = props

  const defaultProps = {
    className: cn(
      'inline-flex items-center justify-center gap-2 rounded-[4px] border font-semibold transition-colors disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0',
      sizeClasses[size],
      variantClasses[variant],
      className,
    ),
  }

  return useRender({
    // The render element's own props win over `props`, so `type` must be resolved here
    // rather than merged in. TypeScript already narrows it to button|submit|reset.
    // oxlint-disable-next-line button-has-type
    render: render ?? <button type={type ?? 'button'} />,
    props: mergeProps<'button'>(defaultProps, buttonProps),
  })
}
