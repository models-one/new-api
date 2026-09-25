import type { InputHTMLAttributes, ReactNode, Ref } from 'react'

import { Field, type FieldOrientation } from '@/components/form/Field'
import { cn } from '@/lib/utils'

export type InputSize = 'md' | 'sm'

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'prefix' | 'size'> & {
  /** Required: every input needs a programmatic label, a placeholder is never one. */
  label: string
  hideLabel?: boolean
  size?: InputSize
  /** Rendered inside the control chrome, before the input (e.g. a "models.one/" pair). */
  prefix?: ReactNode
  /** Rendered inside the control chrome, after the input. */
  suffix?: ReactNode
  invalid?: boolean
  description?: ReactNode
  error?: ReactNode
  orientation?: FieldOrientation
  /** Applied to the Field block (label + control + messages). */
  className?: string
  /** Applied to the `.field` control chrome. */
  controlClassName?: string
  /** Applied to the inner <input>. */
  inputClassName?: string
  ref?: Ref<HTMLInputElement>
}

const controlSizeClasses: Record<InputSize, string> = {
  md: 'min-h-10 px-3',
  sm: 'min-h-9 px-2.5',
}

const inputSizeClasses: Record<InputSize, string> = {
  md: 'text-sm',
  sm: 'text-xs',
}

export function Input(props: InputProps) {
  const {
    label,
    hideLabel,
    size = 'md',
    prefix,
    suffix,
    invalid = false,
    description,
    error,
    orientation,
    className,
    controlClassName,
    inputClassName,
    disabled,
    id,
    required,
    ref,
    ...inputProps
  } = props

  const showInvalid = invalid || (error != null && error !== false && error !== '')

  return (
    <Field
      className={className}
      description={description}
      error={error}
      hideLabel={hideLabel}
      htmlFor={id}
      label={label}
      orientation={orientation}
      required={required}
    >
      {(control) => (
        <div
          className={cn(
            'field flex items-center gap-2',
            controlSizeClasses[size],
            showInvalid && 'border-destructive hover:border-destructive focus-within:border-destructive',
            disabled && 'cursor-not-allowed opacity-60',
            controlClassName,
          )}
        >
          {prefix === undefined ? null : (
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted [&_svg]:size-4 [&_svg]:shrink-0">
              {prefix}
            </span>
          )}
          <input
            {...control}
            {...inputProps}
            aria-invalid={showInvalid || undefined}
            className={cn(
              'w-full min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted/60 disabled:cursor-not-allowed',
              inputSizeClasses[size],
              inputClassName,
            )}
            disabled={disabled}
            ref={ref}
            required={required}
          />
          {suffix === undefined ? null : (
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted [&_svg]:size-4 [&_svg]:shrink-0">
              {suffix}
            </span>
          )}
        </div>
      )}
    </Field>
  )
}
