import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type SwitchSize = 'md' | 'sm'

type SwitchProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Accessible name. Required — an unlabelled switch announces only its state. */
  label: ReactNode
  hideLabel?: boolean
  description?: ReactNode
  disabled?: boolean
  size?: SwitchSize
  name?: string
  className?: string
}

const trackSizeClasses: Record<SwitchSize, string> = {
  md: 'h-6 w-11',
  sm: 'h-5 w-9',
}

const thumbSizeClasses: Record<SwitchSize, string> = {
  md: 'size-5 data-[checked]:translate-x-5',
  sm: 'size-4 data-[checked]:translate-x-4',
}

export function Switch(props: SwitchProps) {
  const { size = 'md' } = props
  const generatedId = useId()
  const controlId = `${generatedId}-switch`
  const descriptionId = props.description ? `${controlId}-description` : undefined

  return (
    <div className={cn('flex items-start gap-3', props.className)}>
      <BaseSwitch.Root
        aria-describedby={descriptionId}
        checked={props.checked}
        className={cn(
          'relative shrink-0 rounded-full border border-border-strong bg-surface-high p-0.5 transition-colors',
          'data-[checked]:border-primary data-[checked]:bg-primary',
          'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
          trackSizeClasses[size],
        )}
        disabled={props.disabled}
        id={controlId}
        name={props.name}
        onCheckedChange={props.onCheckedChange}
      >
        <BaseSwitch.Thumb
          className={cn(
            'block rounded-full bg-muted transition-transform duration-150 data-[checked]:bg-primary-foreground',
            thumbSizeClasses[size],
          )}
        />
      </BaseSwitch.Root>

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

type SwitchRowProps = Omit<SwitchProps, 'className' | 'hideLabel'> & {
  className?: string
}

/**
 * The bordered label-left / control-right row that settings pages are built from.
 * The legacy console repeats this shape across every settings section.
 */
export function SwitchRow(props: SwitchRowProps) {
  const { className, label, description, ...switchProps } = props

  return (
    <div
      className={cn(
        'flex min-h-16 items-center justify-between gap-4 border-b border-border px-1 py-3 last:border-b-0',
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? <p className="mt-1 text-xs leading-5 text-muted">{description}</p> : null}
      </div>
      <Switch {...switchProps} hideLabel label={label} />
    </div>
  )
}
