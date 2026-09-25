import CheckIcon from 'lucide-react/dist/esm/icons/check'

import { cn } from '@/lib/utils'

export type SetupStepDescriptor = {
  id: string
  title: string
  description: string
}

type StepIndicatorProps = {
  steps: readonly SetupStepDescriptor[]
  currentStep: number
  /** Accessible name for the progress list. */
  label: string
}

export function StepIndicator(props: StepIndicatorProps) {
  return (
    <ol aria-label={props.label} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {props.steps.map((step, index) => {
        const active = index === props.currentStep
        const complete = index < props.currentStep

        return (
          <li
            aria-current={active ? 'step' : undefined}
            className={cn(
              'rounded-[var(--radius-panel)] border p-3',
              active && 'border-primary bg-primary/10',
              complete && !active && 'border-primary/40 bg-surface-raised',
              !active && !complete && 'border-border bg-surface',
            )}
            key={step.id}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'mono grid size-6 shrink-0 place-items-center rounded-[3px] border text-xs font-bold',
                  active || complete
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted',
                )}
              >
                {complete ? <CheckIcon aria-hidden="true" className="size-3.5" /> : index + 1}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-sm font-bold',
                    active ? 'text-foreground' : 'text-muted',
                  )}
                >
                  {step.title}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted">{step.description}</p>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
