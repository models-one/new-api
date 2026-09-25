import { Radio } from '@base-ui/react/radio'
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group'
import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type RadioOption<TValue extends string = string> = {
  value: TValue
  label: ReactNode
  description?: ReactNode
  icon?: ReactNode
  disabled?: boolean
}

type RadioGroupVariant = 'list' | 'card'

type RadioGroupProps<TValue extends string = string> = {
  options: readonly RadioOption<TValue>[]
  value: TValue | null
  onValueChange: (value: TValue) => void
  /** Accessible name for the group. Required — the group is announced as a whole. */
  label: string
  hideLabel?: boolean
  description?: ReactNode
  variant?: RadioGroupVariant
  orientation?: 'vertical' | 'horizontal'
  disabled?: boolean
  name?: string
  className?: string
}

/**
 * Mutually exclusive options. Reach for this rather than a row of `aria-pressed`
 * buttons: pressed-state toggles do not tell assistive technology the options are
 * exclusive, nor which one is selected within the set.
 */
export function RadioGroup<TValue extends string = string>(props: RadioGroupProps<TValue>) {
  const { variant = 'list', orientation = 'vertical' } = props
  const generatedId = useId()
  const labelId = `${generatedId}-label`
  const descriptionId = props.description ? `${generatedId}-description` : undefined

  return (
    <div className={props.className}>
      <p className={cn('eyebrow mb-3', props.hideLabel && 'sr-only')} id={labelId}>
        {props.label}
      </p>
      {props.description ? (
        <p className="mb-3 text-xs leading-5 text-muted" id={descriptionId}>
          {props.description}
        </p>
      ) : null}

      <BaseRadioGroup
        aria-describedby={descriptionId}
        aria-labelledby={labelId}
        className={cn(
          'grid gap-3',
          orientation === 'horizontal' && 'sm:grid-flow-col sm:auto-cols-fr',
        )}
        disabled={props.disabled}
        name={props.name}
        onValueChange={(value) => props.onValueChange(value as TValue)}
        value={props.value}
      >
        {props.options.map((option) => (
          <label
            className={cn(
              'flex cursor-pointer items-start gap-3',
              variant === 'card'
                && 'min-h-14 rounded-[4px] border border-border bg-surface-raised px-4 py-3 hover:border-primary has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/10',
              option.disabled && 'cursor-not-allowed opacity-50',
            )}
            key={option.value}
          >
            <Radio.Root
              className={cn(
                'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors',
                'border-border-strong bg-canvas data-[checked]:border-primary',
                'disabled:cursor-not-allowed',
              )}
              disabled={option.disabled}
              value={option.value}
            >
              <Radio.Indicator className="size-2 rounded-full bg-primary" />
            </Radio.Root>

            <span className="flex min-w-0 items-start gap-3">
              {option.icon ? (
                <span aria-hidden="true" className="[&_svg]:size-5 [&_svg]:shrink-0">
                  {option.icon}
                </span>
              ) : null}
              <span className="min-w-0">
                <span className="block text-sm leading-5 text-foreground">{option.label}</span>
                {option.description ? (
                  <span className="mt-1 block text-xs leading-5 text-muted">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </span>
          </label>
        ))}
      </BaseRadioGroup>
    </div>
  )
}
