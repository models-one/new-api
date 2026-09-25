import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down'
import type { ReactNode, Ref, SelectHTMLAttributes } from 'react'

import { Field, type FieldOrientation } from '@/components/form/Field'
import { cn } from '@/lib/utils'

export type NativeSelectSize = 'md' | 'sm'

export type NativeSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export type NativeSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'size'> & {
  /** Required: every control needs a programmatic label. */
  label: string
  hideLabel?: boolean
  size?: NativeSelectSize
  /** Convenience list; `children` <option> elements are rendered after these. */
  options?: readonly NativeSelectOption[]
  /** Rendered as a disabled empty-value option at the top of the list. */
  placeholder?: string
  invalid?: boolean
  description?: ReactNode
  error?: ReactNode
  orientation?: FieldOrientation
  /** Applied to the Field block (label + control + messages). */
  className?: string
  /** Applied to the `.field` select itself. */
  selectClassName?: string
  ref?: Ref<HTMLSelectElement>
}

const selectSizeClasses: Record<NativeSelectSize, string> = {
  md: 'min-h-10 pl-3 text-sm',
  sm: 'min-h-9 pl-2.5 text-xs',
}

export function NativeSelect(props: NativeSelectProps) {
  const {
    label,
    hideLabel,
    size = 'md',
    options,
    placeholder,
    invalid = false,
    description,
    error,
    orientation,
    className,
    selectClassName,
    children,
    disabled,
    id,
    required,
    ref,
    ...selectProps
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
        <div className={cn('relative w-full', disabled && 'cursor-not-allowed opacity-60')}>
          <select
            {...control}
            {...selectProps}
            aria-invalid={showInvalid || undefined}
            className={cn(
              'field w-full appearance-none py-2 pr-9 text-foreground outline-none disabled:cursor-not-allowed [&_option]:bg-surface [&_option]:text-foreground',
              selectSizeClasses[size],
              showInvalid && 'border-destructive hover:border-destructive',
              selectClassName,
            )}
            disabled={disabled}
            ref={ref}
            required={required}
          >
            {placeholder === undefined ? null : (
              <option disabled value="">
                {placeholder}
              </option>
            )}
            {options?.map((option) => (
              <option disabled={option.disabled} key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {children}
          </select>
          <ChevronDownIcon
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
        </div>
      )}
    </Field>
  )
}
