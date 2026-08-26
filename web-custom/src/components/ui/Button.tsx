import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'outline' | 'quiet' | 'danger'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
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

export function Button(props: ButtonProps) {
  const { className, variant = 'primary', ...buttonProps } = props

  return (
    <button
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-[4px] border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0',
        variantClasses[variant],
        className,
      )}
      {...buttonProps}
      type="button"
    />
  )
}
