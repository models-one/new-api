import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import CheckIcon from 'lucide-react/dist/esm/icons/check'
import MinusIcon from 'lucide-react/dist/esm/icons/minus'
import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type CheckboxState = boolean | 'indeterminate'

type CheckboxProps = {
  checked: CheckboxState
  onCheckedChange: (checked: boolean) => void
  /**
   * Accessible name. Required: a checkbox with only adjacent text is unlabelled
   * for assistive technology, and every existing test queries by accessible name.
   */
  label: ReactNode
  /** Renders the label to screen readers only, for dense rows and table headers. */
  hideLabel?: boolean
  description?: ReactNode
  disabled?: boolean
  name?: string
  value?: string
  className?: string
  /** Overrides the composed accessible name when `label` is rich markup. */
  ariaLabel?: string
}

export function Checkbox(props: CheckboxProps) {
  const generatedId = useId()
  const controlId = `${generatedId}-checkbox`
  const descriptionId = props.description ? `${controlId}-description` : undefined

  return (
    <div className={cn('flex items-start gap-3', props.className)}>
      <BaseCheckbox.Root
        aria-describedby={descriptionId}
        aria-label={props.ariaLabel}
        checked={props.checked === 'indeterminate' ? false : props.checked}
        className={cn(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded-[3px] border transition-colors',
          'border-border-strong bg-canvas',
          'data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground',
          'data-[indeterminate]:border-primary data-[indeterminate]:bg-primary data-[indeterminate]:text-primary-foreground',
          'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        )}
        disabled={props.disabled}
        id={controlId}
        indeterminate={props.checked === 'indeterminate'}
        name={props.name}
        onCheckedChange={props.onCheckedChange}
        value={props.value}
      >
        <BaseCheckbox.Indicator className="flex">
          {props.checked === 'indeterminate' ? (
            <MinusIcon aria-hidden="true" className="size-3" />
          ) : (
            <CheckIcon aria-hidden="true" className="size-3" />
          )}
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>

      <div className="min-w-0">
        <label
          className={cn('text-sm leading-5 text-foreground', props.hideLabel && 'sr-only')}
          htmlFor={controlId}
        >
          {props.label}
        </label>
        {props.description ? (
          <p className="mt-1 text-xs leading-5 text-muted" id={descriptionId}>
            {props.description}
          </p>
        ) : null}
      </div>
    </div>
  )
}
