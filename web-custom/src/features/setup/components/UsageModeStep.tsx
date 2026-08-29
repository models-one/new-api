import BuildingIcon from 'lucide-react/dist/esm/icons/building-2'
import HouseIcon from 'lucide-react/dist/esm/icons/house'
import PresentationIcon from 'lucide-react/dist/esm/icons/presentation'
import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'

import type { SetupUsageMode } from '@/features/setup/api'
import { cn } from '@/lib/utils'

type UsageModeStepProps = {
  value: SetupUsageMode
  disabled: boolean
  onChange: (value: SetupUsageMode) => void
}

type UsageModeOption = {
  value: SetupUsageMode
  title: string
  description: string
  icon: ComponentType<{ 'aria-hidden'?: boolean; className?: string }>
}

/**
 * The wizard writes exactly two persisted options, `SelfUseModeEnabled` and
 * `DemoSiteEnabled` (controller/setup.go). "External operation" is the both-false case;
 * the backend has no third flag, so there is no fourth choice to offer.
 */
export function UsageModeStep(props: UsageModeStepProps) {
  const { t } = useTranslation()

  const options: UsageModeOption[] = [
    {
      description: t(
        'Multi-user operation. Registration, pricing and billing behave normally.',
      ),
      icon: BuildingIcon,
      title: t('External operation'),
      value: 'external',
    },
    {
      description: t(
        'Single-operator deployment. Models with no configured price stay usable, and the sign-in page stops advertising registration.',
      ),
      icon: HouseIcon,
      title: t('Personal use'),
      value: 'self',
    },
    {
      description: t('Public demo. The deployment presents itself as a demo site.'),
      icon: PresentationIcon,
      title: t('Demo site'),
      value: 'demo',
    },
  ]

  return (
    <fieldset className="min-w-0" disabled={props.disabled}>
      <legend className="text-sm font-semibold text-foreground">
        {t('How will this deployment be used?')}
      </legend>
      <p className="mt-1 text-xs leading-5 text-muted">
        {t('This can be changed later from the operation settings.')}
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {options.map((option) => {
          const selected = option.value === props.value
          const Icon = option.icon

          return (
            <label
              className={cn(
                'flex cursor-pointer gap-3 rounded-[var(--radius-panel)] border p-4 transition-colors',
                selected ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:border-border-strong',
                props.disabled && 'cursor-not-allowed opacity-60',
              )}
              key={option.value}
            >
              <input
                checked={selected}
                className="mt-1 size-4 shrink-0 accent-[var(--color-primary)]"
                name="usage-mode"
                onChange={() => props.onChange(option.value)}
                type="radio"
                value={option.value}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {option.title}
                </span>
                <span className="mt-1.5 block text-xs leading-5 text-muted">
                  {option.description}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
