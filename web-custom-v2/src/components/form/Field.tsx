import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type FieldOrientation = 'vertical' | 'horizontal'

/** Wiring a Field hands to its control so label, description and error stay connected. */
export type FieldControlProps = {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
  'aria-required'?: true
}

type FieldProps = {
  /** Visible (or screen-reader only) label. Always required: a placeholder is never a label. */
  label: string
  /** Explicit control id. Generated with useId when absent. */
  htmlFor?: string
  description?: ReactNode
  error?: ReactNode
  required?: boolean
  orientation?: FieldOrientation
  /** Keeps the label in the accessibility tree while hiding it visually. */
  hideLabel?: boolean
  className?: string
  labelClassName?: string
  /** Render prop receives the aria wiring; a single element child is cloned with it. */
  children: ReactNode | ((control: FieldControlProps) => ReactNode)
}

export function Field(props: FieldProps) {
  const {
    label,
    htmlFor,
    description,
    error,
    required = false,
    orientation = 'vertical',
    hideLabel = false,
    className,
    labelClassName,
    children,
  } = props

  const generatedId = useId()
  const controlId = htmlFor ?? `${generatedId}control`
  const hasDescription = description != null && description !== false && description !== ''
  const hasError = error != null && error !== false && error !== ''
  const descriptionId = hasDescription ? `${controlId}-description` : undefined
  const errorId = hasError ? `${controlId}-error` : undefined
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ')

  const control: FieldControlProps = {
    id: controlId,
    'aria-describedby': describedBy === '' ? undefined : describedBy,
    'aria-invalid': errorId ? true : undefined,
    'aria-required': required ? true : undefined,
  }

  let controlNode: ReactNode
  if (typeof children === 'function') {
    controlNode = children(control)
  } else if (isValidElement(children) && typeof children.type !== 'symbol') {
    const element = children as ReactElement<Record<string, unknown>>
    controlNode = cloneElement(element, { ...control, ...element.props })
  } else {
    controlNode = children
  }

  const columns = orientation === 'horizontal' && !hideLabel

  return (
    <div
      className={cn(
        'min-w-0',
        columns
          ? 'grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:items-start'
          : 'flex flex-col gap-2',
        className,
      )}
    >
      <label
        className={cn(
          'text-sm font-semibold text-foreground',
          columns && 'sm:pt-2.5',
          hideLabel && 'sr-only',
          labelClassName,
        )}
        htmlFor={controlId}
      >
        {label}
        {required ? <span aria-hidden="true" className="ml-1 text-destructive">*</span> : null}
      </label>

      <div className="flex min-w-0 flex-col gap-1.5">
        {controlNode}
        {descriptionId ? (
          <p className="text-xs leading-5 text-muted" id={descriptionId}>
            {description}
          </p>
        ) : null}
        {errorId ? (
          <p className="text-xs leading-5 text-destructive" id={errorId} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
