import {
  useCallback,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react'

import { Field, type FieldOrientation } from '@/components/form/Field'
import { cn } from '@/lib/utils'

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
  /** Required: every control needs a programmatic label. */
  label: string
  hideLabel?: boolean
  /** Grows the textarea to fit its content instead of scrolling. */
  autoResize?: boolean
  invalid?: boolean
  description?: ReactNode
  error?: ReactNode
  orientation?: FieldOrientation
  /** Applied to the Field block (label + control + messages). */
  className?: string
  /** Applied to the `.field` textarea itself. */
  textareaClassName?: string
  ref?: Ref<HTMLTextAreaElement>
}

export function Textarea(props: TextareaProps) {
  const {
    label,
    hideLabel,
    autoResize = false,
    invalid = false,
    description,
    error,
    orientation,
    className,
    textareaClassName,
    disabled,
    id,
    onChange,
    required,
    ref,
    rows = 4,
    value,
    ...textareaProps
  } = props

  const innerRef = useRef<HTMLTextAreaElement | null>(null)
  const showInvalid = invalid || (error != null && error !== false && error !== '')

  const setTextareaRef = useCallback((node: HTMLTextAreaElement | null) => {
    innerRef.current = node
    if (typeof ref === 'function') {
      ref(node)
      return
    }
    if (ref) ref.current = node
  }, [ref])

  const syncHeight = useCallback(() => {
    const node = innerRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }, [])

  useLayoutEffect(() => {
    if (!autoResize) return
    syncHeight()
  }, [autoResize, syncHeight, value])

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(event)
    if (autoResize) syncHeight()
  }

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
        <textarea
          {...control}
          {...textareaProps}
          aria-invalid={showInvalid || undefined}
          className={cn(
            'field w-full px-3 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted/60 disabled:cursor-not-allowed disabled:opacity-60',
            autoResize ? 'resize-none overflow-hidden' : 'resize-y',
            showInvalid && 'border-destructive hover:border-destructive',
            textareaClassName,
          )}
          disabled={disabled}
          onChange={handleChange}
          ref={setTextareaRef}
          required={required}
          rows={rows}
          value={value}
        />
      )}
    </Field>
  )
}
